package jp.appup.ftpmanager.core;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.KeyStore;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509TrustManager;

import org.apache.commons.net.ftp.FTP;
import org.apache.commons.net.ftp.FTPClient;
import org.apache.commons.net.ftp.FTPFile;
import org.apache.commons.net.ftp.FTPReply;
import org.apache.commons.net.ftp.FTPSClient;
import org.apache.commons.net.util.TrustManagerUtils;

/** One FTP / FTPS connection. Pure Java (no Android APIs) so it can be tested on a JVM. */
public class FtpSession {
    public interface Progress { void update(long done, long total); }

    public static class Entry {
        public final String name; public final String type; public final long size; public final long mtime;
        Entry(String name, String type, long size, long mtime) { this.name = name; this.type = type; this.size = size; this.mtime = mtime; }
    }

    private final FTPClient c;
    public final boolean secure;

    public FtpSession(String host, int port, String user, String password, String secureMode, boolean insecureTls) throws IOException {
        secure = !"none".equals(secureMode);
        if (secure) {
            SSLContext ctx;
            try {
                ctx = SSLContext.getInstance("TLS");
                ctx.init(null, new TrustManager[]{insecureTls ? TrustManagerUtils.getAcceptAllTrustManager() : systemTrustManager()}, null);
            } catch (Exception e) {
                throw new IOException("TLS を初期化できません: " + e.getMessage());
            }
            FTPSClient s = new ReuseFtpsClient("implicit".equals(secureMode), ctx);
            if (!insecureTls) s.setEndpointCheckingEnabled(true); // verify host name
            c = s;
        } else {
            c = new FTPClient();
        }
        c.setControlEncoding("UTF-8");
        c.setConnectTimeout(20000);
        c.setDefaultTimeout(30000);
        c.setDataTimeout(Duration.ofSeconds(60));
        try {
            c.connect(host, port > 0 ? port : ("implicit".equals(secureMode) ? 990 : 21));
            if (!FTPReply.isPositiveCompletion(c.getReplyCode())) throw new IOException("接続拒否: " + reply());
            c.setSoTimeout(60000);
            if (!c.login(user == null || user.isEmpty() ? "anonymous" : user, password == null ? "" : password)) {
                throw new IOException("ログインできません（ユーザー名・パスワードを確認）: " + reply());
            }
            if (secure) {
                ((FTPSClient) c).execPBSZ(0);
                ((FTPSClient) c).execPROT("P");
            }
            c.sendCommand("OPTS", "UTF8 ON");
            c.enterLocalPassiveMode();
            if (!c.setFileType(FTP.BINARY_FILE_TYPE)) throw new IOException("バイナリモードに設定できません: " + reply());
        } catch (IOException e) {
            close();
            throw e;
        }
    }

    private static X509TrustManager systemTrustManager() throws IOException {
        try {
            TrustManagerFactory f = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
            f.init((KeyStore) null);
            for (TrustManager t : f.getTrustManagers()) if (t instanceof X509TrustManager) return (X509TrustManager) t;
        } catch (Exception e) {
            throw new IOException("証明書ストアを読めません: " + e.getMessage());
        }
        throw new IOException("証明書ストアがありません");
    }

    private String reply() { String r = c.getReplyString(); return r == null ? "" : r.trim(); }

    /** Reject anything that could smuggle extra FTP commands. */
    public static String clean(String path) throws IOException {
        if (path == null || !path.startsWith("/") || path.indexOf('\r') >= 0 || path.indexOf('\n') >= 0 || path.indexOf('\0') >= 0) {
            throw new IOException("不正なパスです");
        }
        return path;
    }

    public synchronized String pwd() throws IOException { String p = c.printWorkingDirectory(); return p == null ? "/" : p; }

    public synchronized List<Entry> list(String path) throws IOException {
        if (!c.changeWorkingDirectory(clean(path))) throw new IOException("フォルダを開けません: " + path + " " + reply());
        FTPFile[] files = c.listFiles();
        if (files == null) throw new IOException("一覧を取得できません: " + reply());
        List<Entry> out = new ArrayList<>();
        for (FTPFile f : files) {
            if (f == null) continue;
            String n = f.getName();
            if (n == null || n.equals(".") || n.equals("..")) continue;
            String t = f.isDirectory() ? "dir" : f.isSymbolicLink() ? "link" : "file";
            long m = f.getTimestamp() != null ? f.getTimestamp().getTimeInMillis() : 0;
            out.add(new Entry(n, t, f.getSize(), m));
        }
        return out;
    }

    public synchronized void mkdirs(String path) throws IOException {
        clean(path);
        if (!c.changeWorkingDirectory("/")) throw new IOException("ルートに移動できません: " + reply());
        for (String seg : path.split("/")) {
            if (seg.isEmpty()) continue;
            if (!c.changeWorkingDirectory(seg)) {
                if (!c.makeDirectory(seg) || !c.changeWorkingDirectory(seg)) throw new IOException("フォルダを作れません: " + seg + " " + reply());
            }
        }
    }

    public synchronized void delete(String path, boolean dir) throws IOException {
        clean(path);
        if ("/".equals(path)) throw new IOException("ルートは削除できません");
        if (!dir) {
            if (!c.deleteFile(path)) throw new IOException("削除できません: " + path + " " + reply());
            return;
        }
        for (Entry e : list(path)) delete(join(path, e.name), "dir".equals(e.type));
        c.changeWorkingDirectory("/");
        if (!c.removeDirectory(path)) throw new IOException("フォルダを削除できません: " + path + " " + reply());
    }

    public synchronized void rename(String from, String to) throws IOException {
        if (!c.rename(clean(from), clean(to))) throw new IOException("名前を変更できません: " + reply());
    }

    public synchronized void upload(InputStream in, String remotePath, long total, Progress p) throws IOException {
        clean(remotePath);
        int i = remotePath.lastIndexOf('/');
        mkdirs(i <= 0 ? "/" : remotePath.substring(0, i));
        try (InputStream src = in) {
            OutputStream os = c.storeFileStream(remotePath);
            if (os == null) throw new IOException("アップロードできません: " + reply());
            try (OutputStream o = os) { copy(src, o, total, p); }
            if (!c.completePendingCommand()) throw new IOException("アップロードが完了しませんでした: " + reply());
        }
    }

    public synchronized void download(String remotePath, OutputStream out, long total, Progress p) throws IOException {
        try (OutputStream dst = out) {
            InputStream is = c.retrieveFileStream(clean(remotePath));
            if (is == null) throw new IOException("ダウンロードできません: " + reply());
            try (InputStream s = is) { copy(s, dst, total, p); }
            if (!c.completePendingCommand()) throw new IOException("ダウンロードが完了しませんでした: " + reply());
        }
    }

    public synchronized boolean alive() {
        try { return c.isConnected() && c.sendNoOp(); } catch (IOException e) { return false; }
    }

    public synchronized void close() {
        try { if (c.isConnected()) { c.logout(); } } catch (IOException ignored) { }
        try { c.disconnect(); } catch (IOException ignored) { }
    }

    public static String join(String dir, String name) { return dir.endsWith("/") ? dir + name : dir + "/" + name; }

    static void copy(InputStream in, OutputStream out, long total, Progress p) throws IOException {
        byte[] buf = new byte[64 * 1024];
        long done = 0, last = 0;
        int n;
        while ((n = in.read(buf)) > 0) {
            out.write(buf, 0, n);
            done += n;
            if (p != null && done - last > 256 * 1024) { p.update(done, total); last = done; }
        }
        if (p != null) p.update(done, total);
    }
}
