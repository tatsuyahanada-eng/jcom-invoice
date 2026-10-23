import sys
from pyftpdlib.authorizers import DummyAuthorizer
from pyftpdlib.handlers import TLS_FTPHandler, FTPHandler
from pyftpdlib.handlers.ftps.data import TLS_DTPHandler
from pyftpdlib.servers import FTPServer
from OpenSSL import SSL
root, port, mode = sys.argv[1], int(sys.argv[2]), sys.argv[3]  # mode: plain | tls | tls-reuse

class ReuseRequiredDTP(TLS_DTPHandler):
    # like ProFTPD's default: data channel must resume the control channel's TLS session
    def handle_ssl_established(self):
        if not SSL._lib.SSL_session_reused(self.socket._ssl):
            print('DATA TLS SESSION NOT REUSED -> rejected', flush=True)
            self.close()
            return
        print('data tls session reused', flush=True)
        super().handle_ssl_established()

a = DummyAuthorizer(); a.add_user('u', 'p', root, perm='elradfmwMT')
H = FTPHandler
if mode.startswith('tls'):
    H = TLS_FTPHandler
    H.certfile = 'c.pem'; H.keyfile = 'k.pem'; H.tls_control_required = True; H.tls_data_required = True
    ctx = H.get_ssl_context(); ctx.set_session_id(b'appup-test')
    if mode == 'tls-reuse': H.dtp_handler = ReuseRequiredDTP
H.authorizer = a; H.passive_ports = range(33000, 33100)
import logging; logging.basicConfig(level=logging.ERROR)
FTPServer(('127.0.0.1', port), H).serve_forever()
