package jp.appup.ftpmanager.core;

import java.io.IOException;
import java.net.InetAddress;
import java.net.Socket;

import javax.net.SocketFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLException;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSocket;

import org.apache.commons.net.ftp.FTPSClient;

/**
 * FTPS client whose data connections resume the control connection's TLS session.
 *
 * Many servers (ProFTPD by default, vsftpd with require_ssl_reuse) refuse data
 * connections that do not reuse the control session. TLS libraries look up the
 * session to resume by (host, port); the data connection uses a different port,
 * so we open it as a plain socket that reports the control port, then wrap it
 * in TLS with the control host/port. Works with JSSE and Android's Conscrypt.
 */
class ReuseFtpsClient extends FTPSClient {
    private final SSLContext ctx;
    private boolean endpointCheck;

    ReuseFtpsClient(boolean implicit, SSLContext ctx) {
        super(implicit, ctx);
        this.ctx = ctx;
    }

    @Override
    public void setEndpointCheckingEnabled(boolean enable) {
        super.setEndpointCheckingEnabled(enable);
        endpointCheck = enable;
    }

    /** Plain socket that reports a fixed peer port (the control port). */
    static final class PortMaskSocket extends Socket {
        volatile int maskPort = -1;
        @Override public int getPort() { return maskPort > 0 ? maskPort : super.getPort(); }
    }

    private static final class PlainFactory extends SocketFactory {
        @Override public Socket createSocket() { return new PortMaskSocket(); }
        @Override public Socket createSocket(String h, int p) { throw new UnsupportedOperationException(); }
        @Override public Socket createSocket(String h, int p, InetAddress la, int lp) { throw new UnsupportedOperationException(); }
        @Override public Socket createSocket(InetAddress h, int p) { throw new UnsupportedOperationException(); }
        @Override public Socket createSocket(InetAddress h, int p, InetAddress la, int lp) { throw new UnsupportedOperationException(); }
    }

    @Override
    public void execPROT(String prot) throws SSLException, IOException {
        super.execPROT(prot);
        if ("P".equals(prot)) setSocketFactory(new PlainFactory()); // we add TLS ourselves below
    }

    @Override
    protected Socket _openDataConnection_(String command, String arg) throws IOException {
        Socket s = super._openDataConnection_(command, arg); // plain socket (PROT P) or null
        if (!(s instanceof PortMaskSocket)) return s;
        PortMaskSocket plain = (PortMaskSocket) s;
        String host = _hostname_ != null ? _hostname_ : getRemoteAddress().getHostAddress();
        plain.maskPort = getRemotePort();
        try {
            SSLSocket ssl = (SSLSocket) ctx.getSocketFactory().createSocket(plain, host, getRemotePort(), true);
            ssl.setUseClientMode(true);
            ssl.setEnableSessionCreation(true);
            if (endpointCheck) {
                SSLParameters p = ssl.getSSLParameters();
                p.setEndpointIdentificationAlgorithm("HTTPS");
                ssl.setSSLParameters(p);
            }
            if (getEnabledProtocols() != null) ssl.setEnabledProtocols(getEnabledProtocols());
            if (getEnabledCipherSuites() != null) ssl.setEnabledCipherSuites(getEnabledCipherSuites());
            ssl.startHandshake();
            return ssl;
        } catch (IOException e) {
            plain.close();
            throw e;
        }
    }
}
