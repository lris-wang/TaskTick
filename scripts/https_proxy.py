#!/usr/bin/env python3
"""HTTPS reverse proxy for api.tasktick.asia"""

import ssl
import http.server
import urllib.request
import urllib.error

SSL_CERT = "/etc/letsencrypt/live/api.tasktick.asia/fullchain.pem"
SSL_KEY = "/etc/letsencrypt/live/api.tasktick.asia/privkey.pem"
TARGET = "http://127.0.0.1:8000"
PORT = 443

class ProxyHandler(http.server.BaseHTTPRequestHandler):
    def do_proxy(self, method):
        url = TARGET + self.path
        headers = dict(self.headers)
        for h in ['Connection', 'Keep-Alive', 'Proxy-Connection']:
            headers.pop(h, None)

        try:
            req = urllib.request.Request(url, method=method, headers=headers)
            if self.command in ['POST', 'PUT', 'PATCH']:
                content_length = int(self.headers.get('Content-Length', 0))
                if content_length:
                    req.data = self.rfile.read(content_length)

            with urllib.request.urlopen(req, timeout=30) as response:
                self.send_response(response.status)
                for h, v in response.headers.items():
                    if h.lower() not in ['transfer-encoding', 'connection']:
                        self.send_header(h, v)
                self.end_headers()
                self.wfile.write(response.read())

        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(e.read())
        except Exception as e:
            self.send_response(502)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(f"Proxy error: {e}".encode())

    def do_GET(self):
        self.do_proxy('GET')

    def do_POST(self):
        self.do_proxy('POST')

    def do_PUT(self):
        self.do_proxy('PUT')

    def do_DELETE(self):
        self.do_proxy('DELETE')

    def do_PATCH(self):
        self.do_proxy('PATCH')

    def do_HEAD(self):
        self.do_proxy('HEAD')

    def do_OPTIONS(self):
        self.do_proxy('OPTIONS')

    def log_message(self, format, *args):
        print(f"[{self.log_date_time_string()}] {args[0]}")

if __name__ == '__main__':
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(SSL_CERT, SSL_KEY)
    # Disable older TLS versions
    context.set_ciphers('ECDHE+AESGCM:ECDHE+CHACHA20:DHE+AESGCM:DHE+CHACHA20:!aNULL:!MD5:!DSS')
    context.options |= ssl.OP_NO_SSLv2
    context.options |= ssl.OP_NO_SSLv3
    context.options |= ssl.OP_NO_TLSv1
    context.options |= ssl.OP_NO_TLSv1_1

    server = http.server.HTTPServer(('0.0.0.0', PORT), ProxyHandler)
    server.socket = context.wrap_socket(server.socket, server_side=True)
    print(f"HTTPS proxy running on port {PORT} -> {TARGET}")
    server.serve_forever()