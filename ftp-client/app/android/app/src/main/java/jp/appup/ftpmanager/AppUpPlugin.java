package jp.appup.ftpmanager;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import jp.appup.ftpmanager.core.FtpSession;
import jp.appup.ftpmanager.core.ZipExtract;

/** Native side of the app: phone storage, ZIP extraction and FTP/FTPS. */
@CapacitorPlugin(name = "AppUp")
public class AppUpPlugin extends Plugin {
    private final ExecutorService pool = Executors.newCachedThreadPool();
    private final Map<String, FtpSession> sessions = new ConcurrentHashMap<>();
    private final SecureRandom rnd = new SecureRandom();
    private LocalStore store;

    @Override
    public void load() { store = new LocalStore(getContext()); }

    @Override
    protected void handleOnDestroy() {
        for (FtpSession s : sessions.values()) s.close();
        sessions.clear();
        pool.shutdownNow();
    }

    private interface Task { void run(PluginCall call) throws Exception; }

    private void bg(PluginCall call, Task t) {
        pool.execute(() -> {
            try {
                t.run(call);
            } catch (Exception e) {
                String m = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
                call.reject(m, e instanceof Disconnected ? "DISCONNECTED" : null);
            }
        });
    }

    static class Disconnected extends IOException { Disconnected(String m) { super(m); } }

    private static List<String> segs(PluginCall call, String key) throws IOException {
        JSArray a = call.getArray(key, new JSArray());
        List<String> out = new ArrayList<>();
        try {
            for (int i = 0; i < a.length(); i++) out.add(a.getString(i));
        } catch (Exception e) {
            throw new IOException("パスが不正です");
        }
        return out;
    }

    /** JSON numbers arrive as Integer, Long or Double depending on size. */
    private static long num(PluginCall call, String key, long def) {
        Object v = call.getData().opt(key);
        return v instanceof Number ? ((Number) v).longValue() : def;
    }

    private static String req(PluginCall call, String key) throws IOException {
        String v = call.getString(key);
        if (v == null) throw new IOException(key + " がありません");
        return v;
    }

    private void progress(String job, long done, long total, String file) {
        if (job == null) return;
        JSObject o = new JSObject();
        o.put("job", job);
        o.put("done", done);
        o.put("total", total);
        if (file != null) o.put("file", file);
        notifyListeners("progress", o);
    }

    // ===================== local storage =====================

    @PluginMethod
    public void roots(PluginCall call) {
        bg(call, c -> {
            JSArray arr = new JSArray();
            JSObject app = new JSObject();
            app.put("id", LocalStore.APP_ROOT);
            app.put("name", "アプリ内作業領域");
            arr.put(app);
            for (Uri u : store.grantedTrees()) {
                DocumentFile d = DocumentFile.fromTreeUri(getContext(), u);
                JSObject o = new JSObject();
                o.put("id", u.toString());
                o.put("name", d != null && d.getName() != null ? d.getName() : u.getLastPathSegment());
                arr.put(o);
            }
            JSObject r = new JSObject();
            r.put("roots", arr);
            c.resolve(r);
        });
    }

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        startActivityForResult(call, i, "pickFolderResult");
    }

    @ActivityCallback
    private void pickFolderResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("キャンセルしました", "CANCELLED");
            return;
        }
        Uri uri = result.getData().getData();
        try {
            getContext().getContentResolver().takePersistableUriPermission(uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        } catch (SecurityException e) {
            call.reject("このフォルダは使えません（Android の制限）。中のフォルダを選んでください");
            return;
        }
        DocumentFile d = DocumentFile.fromTreeUri(getContext(), uri);
        JSObject o = new JSObject();
        o.put("id", uri.toString());
        o.put("name", d != null && d.getName() != null ? d.getName() : uri.getLastPathSegment());
        call.resolve(o);
    }

    @PluginMethod
    public void forgetFolder(PluginCall call) {
        bg(call, c -> {
            Uri u = Uri.parse(req(c, "root"));
            getContext().getContentResolver().releasePersistableUriPermission(u,
                Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            c.resolve();
        });
    }

    @PluginMethod
    public void list(PluginCall call) {
        bg(call, c -> {
            LocalStore.Node n = store.resolve(req(c, "root"), segs(c, "path"), false);
            JSArray arr = new JSArray();
            for (LocalStore.Node k : n.children()) {
                JSObject o = new JSObject();
                o.put("name", k.name());
                o.put("type", k.isDir() ? "dir" : "file");
                o.put("size", k.size());
                o.put("mtime", k.mtime());
                arr.put(o);
            }
            JSObject r = new JSObject();
            r.put("items", arr);
            c.resolve(r);
        });
    }

    @PluginMethod
    public void mkdir(PluginCall call) {
        bg(call, c -> { store.resolve(req(c, "root"), segs(c, "path"), true); c.resolve(); });
    }

    @PluginMethod
    public void remove(PluginCall call) {
        bg(call, c -> {
            List<String> p = segs(c, "path");
            if (p.isEmpty()) throw new IOException("ルートは削除できません");
            store.resolve(req(c, "root"), p, false).delete();
            c.resolve();
        });
    }

    @PluginMethod
    public void rename(PluginCall call) {
        bg(call, c -> {
            List<String> p = segs(c, "path");
            if (p.isEmpty()) throw new IOException("ルートは変更できません");
            String nn = req(c, "newName");
            LocalStore.Node parent = store.resolve(req(c, "root"), p.subList(0, p.size() - 1), false);
            if (parent.child(nn) != null) throw new IOException("同じ名前が既にあります");
            store.resolve(req(c, "root"), p, false).rename(nn);
            c.resolve();
        });
    }

    @PluginMethod
    public void exists(PluginCall call) {
        bg(call, c -> {
            JSObject r = new JSObject();
            try {
                LocalStore.Node n = store.resolve(req(c, "root"), segs(c, "path"), false);
                r.put("type", n.isDir() ? "dir" : "file");
            } catch (IOException e) {
                r.put("type", (String) null);
            }
            c.resolve(r);
        });
    }

    @PluginMethod
    public void stat(PluginCall call) {
        bg(call, c -> {
            LocalStore.Node n = store.resolve(req(c, "root"), segs(c, "path"), false);
            JSObject r = new JSObject();
            r.put("type", n.isDir() ? "dir" : "file");
            r.put("size", n.size());
            r.put("uri", n.uri());
            c.resolve(r);
        });
    }

    @PluginMethod
    public void copy(PluginCall call) {
        bg(call, c -> {
            List<String> dst = segs(c, "dstPath");
            if (dst.isEmpty()) throw new IOException("コピー先が不正です");
            LocalStore.Node src = store.resolve(req(c, "srcRoot"), segs(c, "srcPath"), false);
            LocalStore.Node parent = store.resolve(req(c, "dstRoot"), dst.subList(0, dst.size() - 1), true);
            String job = c.getString("job");
            final long[] n = {0};
            store.copy(src, parent, dst.get(dst.size() - 1), () -> progress(job, ++n[0], 0, null));
            JSObject r = new JSObject();
            r.put("files", n[0]);
            c.resolve(r);
        });
    }

    @PluginMethod
    public void walk(PluginCall call) {
        bg(call, c -> {
            LocalStore.Node n = store.resolve(req(c, "root"), segs(c, "path"), false);
            JSArray arr = new JSArray();
            walkInto(n, new ArrayList<>(), arr);
            JSObject r = new JSObject();
            r.put("items", arr);
            c.resolve(r);
        });
    }

    private void walkInto(LocalStore.Node n, List<String> rel, JSArray out) throws IOException {
        for (LocalStore.Node k : n.children()) {
            List<String> r = new ArrayList<>(rel);
            r.add(k.name());
            JSObject o = new JSObject();
            o.put("rel", new JSArray(r));
            o.put("dir", k.isDir());
            o.put("size", k.size());
            out.put(o);
            if (k.isDir()) walkInto(k, r, out);
        }
    }

    /** Write base64 data (used when JS extracted a non-ZIP archive). */
    @PluginMethod
    public void writeChunk(PluginCall call) {
        bg(call, c -> {
            List<String> p = segs(c, "path");
            if (p.isEmpty()) throw new IOException("パスが不正です");
            LocalStore.Node parent = store.resolve(req(c, "root"), p.subList(0, p.size() - 1), true);
            byte[] data = Base64.decode(c.getString("data", ""), Base64.DEFAULT);
            try (OutputStream o = parent.create(p.get(p.size() - 1), Boolean.TRUE.equals(c.getBoolean("append", false)))) {
                o.write(data);
            }
            c.resolve();
        });
    }

    /** Read base64 (fallback when the WebView cannot fetch the file URL). */
    @PluginMethod
    public void readChunk(PluginCall call) {
        bg(call, c -> {
            LocalStore.Node n = store.resolve(req(c, "root"), segs(c, "path"), false);
            long offset = num(c, "offset", 0);
            int length = (int) Math.max(1, Math.min(num(c, "length", 1 << 20), 4 << 20));
            byte[] buf = new byte[length];
            int got = 0;
            try (InputStream in = n.open()) {
                long skipped = 0;
                while (skipped < offset) { long s = in.skip(offset - skipped); if (s <= 0) break; skipped += s; }
                int r;
                while (got < length && (r = in.read(buf, got, length - got)) > 0) got += r;
            }
            JSObject o = new JSObject();
            o.put("data", Base64.encodeToString(buf, 0, got, Base64.NO_WRAP));
            o.put("eof", got < length);
            c.resolve(o);
        });
    }

    /** Pick files anywhere on the phone (e.g. Download) and copy them into root/path. */
    @PluginMethod
    public void importFiles(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("*/*");
        i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        startActivityForResult(call, i, "importResult");
    }

    @ActivityCallback
    private void importResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("キャンセルしました", "CANCELLED");
            return;
        }
        Intent data = result.getData();
        List<Uri> uris = new ArrayList<>();
        if (data.getClipData() != null) {
            for (int k = 0; k < data.getClipData().getItemCount(); k++) uris.add(data.getClipData().getItemAt(k).getUri());
        } else if (data.getData() != null) {
            uris.add(data.getData());
        }
        bg(call, c -> {
            LocalStore.Node dir = store.resolve(req(c, "root"), segs(c, "path"), true);
            String job = c.getString("job");
            JSArray names = new JSArray();
            int k = 0;
            for (Uri u : uris) {
                String name = displayName(u);
                progress(job, k++, uris.size(), name);
                InputStream in = getContext().getContentResolver().openInputStream(u);
                if (in == null) throw new IOException("読み込めません: " + name);
                LocalStore.copyStream(in, dir.create(name, false));
                names.put(name);
            }
            JSObject r = new JSObject();
            r.put("names", names);
            c.resolve(r);
        });
    }

    private String displayName(Uri u) {
        String name = null;
        try (Cursor cur = getContext().getContentResolver().query(u, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cur != null && cur.moveToFirst()) name = cur.getString(0);
        } catch (Exception ignored) { }
        if (name == null) name = u.getLastPathSegment();
        if (name == null) name = "file";
        name = name.replaceAll("[/\\\\\\x00]", "_");
        if (name.equals(".") || name.equals("..")) name = "file";
        return name;
    }

    /** Save one local file to a place the user picks (e.g. Download). */
    @PluginMethod
    public void exportFile(PluginCall call) {
        try {
            List<String> p = segs(call, "path");
            Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            String name = p.isEmpty() ? "file" : p.get(p.size() - 1);
            i.setType(LocalStore.mimeOf(name));
            i.putExtra(Intent.EXTRA_TITLE, name);
            startActivityForResult(call, i, "exportResult");
        } catch (IOException e) {
            call.reject(e.getMessage());
        }
    }

    @ActivityCallback
    private void exportResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("キャンセルしました", "CANCELLED");
            return;
        }
        Uri target = result.getData().getData();
        bg(call, c -> {
            LocalStore.Node n = store.resolve(req(c, "root"), segs(c, "path"), false);
            OutputStream o = getContext().getContentResolver().openOutputStream(target, "wt");
            if (o == null) throw new IOException("保存できません");
            LocalStore.copyStream(n.open(), o);
            c.resolve();
        });
    }

    /** Extract a ZIP natively. Rejects with code UNSUPPORTED so JS can fall back. */
    @PluginMethod
    public void extractZip(PluginCall call) {
        bg(call, c -> {
            LocalStore.Node zip = store.resolve(req(c, "root"), segs(c, "path"), false);
            LocalStore.Node dest = store.resolve(req(c, "dstRoot"), segs(c, "dstPath"), true);
            String job = c.getString("job");
            int n;
            try {
                n = ZipExtract.extract(zip::open, new ZipExtract.Sink() {
                    LocalStore.Node dir(List<String> s) throws IOException {
                        LocalStore.Node d = dest;
                        for (String x : s) d = d.mkdir(x);
                        return d;
                    }
                    public void mkdirs(List<String> s) throws IOException { dir(s); }
                    public OutputStream create(List<String> s) throws IOException {
                        return dir(s.subList(0, s.size() - 1)).create(s.get(s.size() - 1), false);
                    }
                }, (i, path) -> progress(job, i, 0, path));
            } catch (java.util.zip.ZipException e) {
                c.reject("ZIP: " + e.getMessage(), "UNSUPPORTED");
                return;
            }
            JSObject r = new JSObject();
            r.put("files", n);
            c.resolve(r);
        });
    }

    // ===================== FTP =====================

    private FtpSession session(PluginCall c) throws IOException {
        FtpSession s = sessions.get(req(c, "sid"));
        if (s == null) throw new Disconnected("接続が切れました。再接続してください");
        return s;
    }

    /** Turn a failure on a dead connection into DISCONNECTED. */
    private IOException check(PluginCall c, IOException e) {
        FtpSession s = sessions.get(c.getString("sid", ""));
        if (s != null && !s.alive()) {
            sessions.remove(c.getString("sid"));
            s.close();
            return new Disconnected("接続が切れました。再接続してください（" + e.getMessage() + "）");
        }
        return e;
    }

    private interface FtpTask { void run(PluginCall c, FtpSession s) throws Exception; }

    private void ftp(PluginCall call, FtpTask t) {
        bg(call, c -> {
            FtpSession s = session(c);
            try { t.run(c, s); } catch (IOException e) { throw check(c, e); }
        });
    }

    @PluginMethod
    public void ftpConnect(PluginCall call) {
        bg(call, c -> {
            String host = req(c, "host").trim();
            if (host.isEmpty() || host.matches(".*[\\s/].*")) throw new IOException("ホスト名が不正です");
            FtpSession s = new FtpSession(host, (int) num(c, "port", 0), c.getString("user", ""), c.getString("password", ""),
                c.getString("secure", "explicit"), Boolean.TRUE.equals(c.getBoolean("insecureTls", false)));
            byte[] b = new byte[18];
            rnd.nextBytes(b);
            String sid = Base64.encodeToString(b, Base64.NO_WRAP | Base64.URL_SAFE | Base64.NO_PADDING);
            sessions.put(sid, s);
            JSObject r = new JSObject();
            r.put("sid", sid);
            r.put("pwd", s.pwd());
            c.resolve(r);
        });
    }

    @PluginMethod
    public void ftpDisconnect(PluginCall call) {
        bg(call, c -> {
            FtpSession s = sessions.remove(c.getString("sid", ""));
            if (s != null) s.close();
            c.resolve();
        });
    }

    @PluginMethod
    public void ftpList(PluginCall call) {
        ftp(call, (c, s) -> {
            JSArray arr = new JSArray();
            for (FtpSession.Entry e : s.list(req(c, "path"))) {
                JSObject o = new JSObject();
                o.put("name", e.name);
                o.put("type", e.type);
                o.put("size", e.size);
                o.put("mtime", e.mtime);
                arr.put(o);
            }
            JSObject r = new JSObject();
            r.put("items", arr);
            c.resolve(r);
        });
    }

    @PluginMethod
    public void ftpMkdir(PluginCall call) { ftp(call, (c, s) -> { s.mkdirs(req(c, "path")); c.resolve(); }); }

    @PluginMethod
    public void ftpDelete(PluginCall call) {
        ftp(call, (c, s) -> { s.delete(req(c, "path"), Boolean.TRUE.equals(c.getBoolean("dir", false))); c.resolve(); });
    }

    @PluginMethod
    public void ftpRename(PluginCall call) { ftp(call, (c, s) -> { s.rename(req(c, "from"), req(c, "to")); c.resolve(); }); }

    @PluginMethod
    public void ftpUpload(PluginCall call) {
        ftp(call, (c, s) -> {
            LocalStore.Node n = store.resolve(req(c, "root"), segs(c, "path"), false);
            String job = c.getString("job");
            s.upload(n.open(), req(c, "remote"), n.size(), (d, t) -> progress(job, d, t, null));
            c.resolve();
        });
    }

    @PluginMethod
    public void ftpDownload(PluginCall call) {
        ftp(call, (c, s) -> {
            List<String> p = segs(c, "path");
            if (p.isEmpty()) throw new IOException("保存先が不正です");
            LocalStore.Node parent = store.resolve(req(c, "root"), p.subList(0, p.size() - 1), true);
            String job = c.getString("job");
            long size = num(c, "size", 0);
            s.download(req(c, "remote"), parent.create(p.get(p.size() - 1), false), size, (d, t) -> progress(job, d, t, null));
            c.resolve();
        });
    }

    // ===================== app =====================

    @PluginMethod
    public void exitApp(PluginCall call) {
        call.resolve();
        getActivity().runOnUiThread(() -> getActivity().moveTaskToBack(true));
    }
}
