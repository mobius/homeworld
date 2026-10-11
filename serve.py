#!/usr/bin/env python3
"""本地静态服务:带 COOP/COEP 响应头,使 wasm 游戏(需 SharedArrayBuffer)
在顶层页面与 iframe 中都获得跨源隔离。用法: python serve.py [port]"""
import http.server
import sys

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # 静音访问日志

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8931
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler) as srv:
        print(f"Serving http://127.0.0.1:{port}/  (COOP/COEP 已启用,Ctrl+C 退出)")
        srv.serve_forever()
