package jp.appup.ftpmanager;

import android.content.Context;
import android.content.UriPermission;
import android.net.Uri;
import android.webkit.MimeTypeMap;

import androidx.documentfile.provider.DocumentFile;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Local storage seen by the app:
 *  - "app": private workspace inside the app (no permission needed)
 *  - content://... tree URIs: phone folders the user granted via the system folder picker
 */
public class LocalStore {
    public static final String APP_ROOT = "app";
    private final Context ctx;

    public LocalStore(Context ctx) { this.ctx = ctx; }

    public interface Node {
        String name();
        boolean isDir();
        long size();
        long mtime();
        List<Node> children() throws IOException;
        Node child(String name) throws IOException;      // null if missing
        Node mkdir(String name) throws IOException;      // returns existing dir if present
        OutputStream create(String name, boolean append) throws IOException; // overwrite (or append)
        InputStream open() throws IOException;
        void delete() throws IOException;
        void rename(String newName) throws IOException;
        String uri();
    }

    public File appDir() {
        File d = new File(ctx.getFilesDir(), "workspace");
        if (!d.exists() && !d.mkdirs()) throw new IllegalStateException("作業領域を作れません");
        return d;
    }

    public List<Uri> grantedTrees() {
        List<Uri> out = new ArrayList<>();
        for (UriPermission p : ctx.getContentResolver().getPersistedUriPermissions()) {
            if (p.isReadPermission() && p.isWritePermission()) out.add(p.getUri());
        }
        return out;
    }

    public Node root(String id) throws IOException {
        if (APP_ROOT.equals(id)) return new FileNode(appDir());
        Uri uri = Uri.parse(id);
        if (!grantedTrees().contains(uri)) throw new IOException("このフォルダへのアクセス許可がありません。フォルダを開き直してください");
        DocumentFile d = DocumentFile.fromTreeUri(ctx, uri);
        if (d == null || !d.exists()) throw new IOException("フォルダが見つかりません");
        return new DocNode(d);
    }

    public Node resolve(String rootId, List<String> segs, boolean createDirs) throws IOException {
        Node n = root(rootId);
        for (String s : segs) {
            checkName(s);
            Node c = n.child(s);
            if (c == null) {
                if (!createDirs) throw new IOException("見つかりません: " + s);
                c = n.mkdir(s);
            }
            n = c;
        }
        return n;
    }

    static void checkName(String s) throws IOException {
        if (s == null || s.isEmpty() || s.equals(".") || s.equals("..") || s.contains("/") || s.contains("\\") || s.indexOf('\0') >= 0) {
            throw new IOException("使えない名前です: " + s);
        }
    }

    public static void copyStream(InputStream in, OutputStream out) throws IOException {
        try (InputStream i = in; OutputStream o = out) {
            byte[] b = new byte[64 * 1024];
            int n;
            while ((n = i.read(b)) > 0) o.write(b, 0, n);
        }
    }

    /** Recursive copy of src into dstParent under name. */
    public void copy(Node src, Node dstParent, String name, Runnable onFile) throws IOException {
        if (src.isDir()) {
            Node d = dstParent.mkdir(name);
            for (Node c : src.children()) copy(c, d, c.name(), onFile);
        } else {
            copyStream(src.open(), dstParent.create(name, false));
            if (onFile != null) onFile.run();
        }
    }

    // ---- java.io.File (app workspace) ----
    static class FileNode implements Node {
        final File f;
        FileNode(File f) { this.f = f; }
        public String name() { return f.getName(); }
        public boolean isDir() { return f.isDirectory(); }
        public long size() { return f.isFile() ? f.length() : 0; }
        public long mtime() { return f.lastModified(); }
        public List<Node> children() {
            List<Node> out = new ArrayList<>();
            File[] fs = f.listFiles();
            if (fs != null) for (File c : fs) out.add(new FileNode(c));
            return out;
        }
        public Node child(String name) throws IOException { checkName(name); File c = new File(f, name); return c.exists() ? new FileNode(c) : null; }
        public Node mkdir(String name) throws IOException {
            checkName(name);
            File c = new File(f, name);
            if (c.isFile()) throw new IOException("同じ名前のファイルがあります: " + name);
            if (!c.isDirectory() && !c.mkdirs()) throw new IOException("フォルダを作れません: " + name);
            return new FileNode(c);
        }
        public OutputStream create(String name, boolean append) throws IOException {
            checkName(name);
            File c = new File(f, name);
            if (c.isDirectory()) throw new IOException("同じ名前のフォルダがあります: " + name);
            return new FileOutputStream(c, append);
        }
        public InputStream open() throws IOException { return new FileInputStream(f); }
        public void delete() throws IOException { deleteRec(f); }
        private static void deleteRec(File x) throws IOException {
            File[] cs = x.listFiles();
            if (cs != null) for (File c : cs) deleteRec(c);
            if (x.exists() && !x.delete()) throw new IOException("削除できません: " + x.getName());
        }
        public void rename(String newName) throws IOException {
            checkName(newName);
            File t = new File(f.getParentFile(), newName);
            if (t.exists()) throw new IOException("同じ名前が既にあります");
            if (!f.renameTo(t)) throw new IOException("名前を変更できません");
        }
        public String uri() { return Uri.fromFile(f).toString(); }
    }

    // ---- Storage Access Framework (phone folders) ----
    class DocNode implements Node {
        final DocumentFile d;
        private Map<String, DocumentFile> cache;
        DocNode(DocumentFile d) { this.d = d; }
        public String name() { return d.getName(); }
        public boolean isDir() { return d.isDirectory(); }
        public long size() { return d.isFile() ? d.length() : 0; }
        public long mtime() { return d.lastModified(); }
        private Map<String, DocumentFile> kids() {
            if (cache == null) {
                cache = new HashMap<>();
                for (DocumentFile c : d.listFiles()) if (c.getName() != null) cache.put(c.getName(), c);
            }
            return cache;
        }
        public List<Node> children() {
            List<Node> out = new ArrayList<>();
            for (DocumentFile c : kids().values()) out.add(new DocNode(c));
            return out;
        }
        public Node child(String name) throws IOException { checkName(name); DocumentFile c = kids().get(name); return c == null ? null : new DocNode(c); }
        public Node mkdir(String name) throws IOException {
            checkName(name);
            DocumentFile c = kids().get(name);
            if (c != null) {
                if (!c.isDirectory()) throw new IOException("同じ名前のファイルがあります: " + name);
                return new DocNode(c);
            }
            c = d.createDirectory(name);
            if (c == null) throw new IOException("フォルダを作れません: " + name);
            kids().put(name, c);
            return new DocNode(c);
        }
        public OutputStream create(String name, boolean append) throws IOException {
            checkName(name);
            DocumentFile c = kids().get(name);
            if (c != null && c.isDirectory()) throw new IOException("同じ名前のフォルダがあります: " + name);
            if (c == null) {
                c = d.createFile(mimeOf(name), name);
                if (c == null) throw new IOException("ファイルを作れません: " + name);
                if (!name.equals(c.getName())) c.renameTo(name); // some providers append an extension
                kids().put(name, c);
            }
            OutputStream o = ctx.getContentResolver().openOutputStream(c.getUri(), append ? "wa" : "wt");
            if (o == null) throw new IOException("書き込めません: " + name);
            return o;
        }
        public InputStream open() throws IOException {
            InputStream i = ctx.getContentResolver().openInputStream(d.getUri());
            if (i == null) throw new IOException("読み込めません: " + name());
            return i;
        }
        public void delete() throws IOException { if (!d.delete()) throw new IOException("削除できません: " + name()); }
        public void rename(String newName) throws IOException {
            checkName(newName);
            if (!d.renameTo(newName)) throw new IOException("名前を変更できません");
        }
        public String uri() { return d.getUri().toString(); }
    }

    static String mimeOf(String name) {
        int i = name.lastIndexOf('.');
        String ext = i < 0 ? "" : name.substring(i + 1).toLowerCase();
        String m = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
        return m == null ? "application/octet-stream" : m;
    }
}
