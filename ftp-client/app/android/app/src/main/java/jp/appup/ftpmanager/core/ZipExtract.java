package jp.appup.ftpmanager.core;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Streams a ZIP into a Sink. File names: UTF-8 when valid, otherwise Shift_JIS
 * (MS932, used by Japanese Windows). Paths with "..", etc. abort before writing.
 */
public class ZipExtract {
    public interface Source { InputStream open() throws IOException; }
    public interface Sink {
        void mkdirs(List<String> segs) throws IOException;
        OutputStream create(List<String> segs) throws IOException;
    }
    public interface Progress { void file(int index, String path); }

    /** Stops runaway "zip bombs". */
    public static long MAX_TOTAL_BYTES = 8L * 1024 * 1024 * 1024;

    public static int extract(Source src, Sink sink, Progress p) throws IOException {
        // pass 1: read raw names (ISO-8859-1 keeps the bytes), pick the charset
        Charset cs = StandardCharsets.UTF_8;
        for (String raw : scan(src, StandardCharsets.ISO_8859_1)) {
            if (!looksUtf8(raw)) { cs = Charset.forName("MS932"); break; }
        }
        for (String n : scan(src, cs)) safeSegments(n);

        int count = 0;
        long total = 0;
        byte[] buf = new byte[64 * 1024];
        try (ZipInputStream z = new ZipInputStream(src.open(), cs)) {
            ZipEntry e;
            while ((e = z.getNextEntry()) != null) {
                List<String> segs = safeSegments(e.getName());
                if (segs.isEmpty()) continue;
                if (e.isDirectory()) { sink.mkdirs(segs); continue; }
                if (p != null) p.file(count, String.join("/", segs));
                try (OutputStream o = sink.create(segs)) {
                    int n;
                    while ((n = z.read(buf)) > 0) {
                        total += n;
                        if (total > MAX_TOTAL_BYTES) throw new IOException("展開サイズが大きすぎます（8GB 超）");
                        o.write(buf, 0, n);
                    }
                }
                count++;
            }
        }
        return count;
    }

    /** raw: name decoded as ISO-8859-1, or already-decoded UTF-8 when the entry has the UTF-8 flag. */
    static boolean looksUtf8(String raw) {
        boolean ascii = true;
        for (int i = 0; i < raw.length(); i++) {
            char ch = raw.charAt(i);
            if (ch > 0xff) return true; // UTF-8 flagged entry, decoded by ZipInputStream
            if (ch > 0x7f) ascii = false;
        }
        if (ascii) return true;
        try {
            StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(java.nio.charset.CodingErrorAction.REPORT)
                .onUnmappableCharacter(java.nio.charset.CodingErrorAction.REPORT)
                .decode(java.nio.ByteBuffer.wrap(raw.getBytes(StandardCharsets.ISO_8859_1)));
            return true;
        } catch (java.nio.charset.CharacterCodingException e) {
            return false;
        }
    }

    private static List<String> scan(Source src, Charset cs) throws IOException {
        List<String> names = new ArrayList<>();
        try (ZipInputStream z = new ZipInputStream(src.open(), cs)) {
            ZipEntry e;
            while ((e = z.getNextEntry()) != null) names.add(e.getName());
        }
        if (names.isEmpty()) throw new IOException("ZIP として読めません（空か壊れています）");
        return names;
    }

    /** Same rules as the web version (public/js/archive/util.js). */
    public static List<String> safeSegments(String path) throws IOException {
        List<String> out = new ArrayList<>();
        for (String s : path.replace('\\', '/').split("/")) {
            s = s.trim();
            if (s.isEmpty() || s.equals(".")) continue;
            if (s.equals("..")) throw new IOException("危険なパスを含むため中止しました: " + path);
            if (out.isEmpty() && s.matches("^[a-zA-Z]:$")) continue;
            out.add(s.replaceAll("[\\x00-\\x1f<>:\"|?*]", "_"));
        }
        return out;
    }
}
