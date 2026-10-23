import jp.appup.ftpmanager.core.*;
import java.io.*; import java.nio.file.*; import java.util.*;
/**
 * JVM test for the app's native core (FtpSession / ZipExtract).
 * Run with ./run.sh (starts local FTP, FTPS and "TLS session reuse required" servers).
 * args: fixturesDir ftpPort ftpsPort ftpRoot utf8Zip reuseFtpsPort
 */
public class CoreTest {
  static void check(boolean ok, String msg) { System.out.println((ok ? "ok   " : "FAIL ") + msg); if (!ok) failed = true; }
  static boolean failed = false;
  static ZipExtract.Sink dirSink(Path root) {
    return new ZipExtract.Sink() {
      public void mkdirs(List<String> s) throws IOException { Files.createDirectories(root.resolve(String.join("/", s))); }
      public OutputStream create(List<String> s) throws IOException { Path p = root.resolve(String.join("/", s)); Files.createDirectories(p.getParent()); return Files.newOutputStream(p); }
    };
  }
  public static void main(String[] a) throws Exception {
    String fx = a[0]; int port = Integer.parseInt(a[1]); int sport = Integer.parseInt(a[2]); Path ftpRoot = Paths.get(a[3]);
    Path out = Files.createTempDirectory("zx");
    int n = ZipExtract.extract(() -> new FileInputStream(fx + "/sjis.zip"), dirSink(out), null);
    check(n == 2 && Files.exists(out.resolve("日本語/text.txt")) && Files.size(out.resolve("日本語/data.bin")) == 3000, "sjis zip -> 日本語/ (" + n + ")");
    Path out2 = Files.createTempDirectory("zx");
    n = ZipExtract.extract(() -> new FileInputStream(a[4]), dirSink(out2), null);
    check(Files.exists(out2.resolve("src/日本語.txt")) && Files.size(out2.resolve("src/big.txt")) == 1649847, "utf8 zip with dirs (" + n + ")");
    try { ZipExtract.extract(() -> new FileInputStream(fx + "/slip.zip"), dirSink(out), null); check(false, "slip"); }
    catch (IOException e) { check(e.getMessage().contains("危険"), "zip slip rejected: " + e.getMessage()); }

    FtpSession s = new FtpSession("127.0.0.1", port, "u", "p", "none", false);
    s.mkdirs("/www/app/img");
    byte[] data = new byte[200000]; new Random(1).nextBytes(data);
    long[] prog = {0};
    s.upload(new ByteArrayInputStream(data), "/www/app/日本語.bin", data.length, (d, t) -> prog[0] = d);
    check(Arrays.equals(Files.readAllBytes(ftpRoot.resolve("www/app/日本語.bin")), data) && prog[0] == data.length, "upload utf8 name + progress");
    s.upload(new ByteArrayInputStream("x".getBytes()), "/new/deep/dir/a.txt", 1, null);
    check(Files.exists(ftpRoot.resolve("new/deep/dir/a.txt")), "upload creates parent dirs");
    List<FtpSession.Entry> l = s.list("/www/app");
    check(l.size() == 2, "list: " + l.stream().map(e -> e.name + ":" + e.type).toList());
    ByteArrayOutputStream bo = new ByteArrayOutputStream();
    s.download("/www/app/日本語.bin", bo, data.length, null);
    check(Arrays.equals(bo.toByteArray(), data), "download");
    s.rename("/www/app/日本語.bin", "/www/renamed.bin");
    check(Files.exists(ftpRoot.resolve("www/renamed.bin")), "rename");
    s.delete("/www", true);
    check(!Files.exists(ftpRoot.resolve("www")), "recursive delete");
    try { s.list("/x\r\nDELE a"); check(false, "inj"); } catch (IOException e) { check(true, "CRLF rejected"); }
    check(s.alive(), "alive");
    s.close();
    try { new FtpSession("127.0.0.1", port, "u", "bad", "none", false); check(false, "bad login"); } catch (IOException e) { check(true, "bad login: " + e.getMessage().split("\n")[0]); }
    try { new FtpSession("127.0.0.1", sport, "u", "p", "explicit", false); check(false, "strict tls"); } catch (IOException e) { check(true, "self-signed rejected: " + e.getClass().getSimpleName()); }
    FtpSession t = new FtpSession("127.0.0.1", sport, "u", "p", "explicit", true);
    t.upload(new ByteArrayInputStream(data), "/tls/x.bin", data.length, null);
    check(Arrays.equals(Files.readAllBytes(ftpRoot.resolve("tls/x.bin")), data), "FTPS upload");
    check(t.list("/tls").size() == 1, "FTPS list");
    t.close();
    // server that rejects data connections not resuming the control TLS session (ProFTPD default)
    FtpSession r = new FtpSession("127.0.0.1", Integer.parseInt(a[5]), "u", "p", "explicit", true);
    r.upload(new ByteArrayInputStream(data), "/reuse/x.bin", data.length, null);
    check(Arrays.equals(Files.readAllBytes(ftpRoot.resolve("reuse/x.bin")), data), "FTPS with TLS session reuse required");
    r.close();
    System.out.println(failed ? "FAILED" : "ALL OK");
    if (failed) System.exit(1);
  }
}
