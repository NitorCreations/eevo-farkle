#!/usr/bin/env python3
"""
Simple HTTP server with Eevo API proxy for Farkle game.

Serves static files and proxies requests to Eevo API to handle CORS.

Usage:
    python3 server.py [port]
    
Default port is 8080.
"""

import http.server
import json
import os
import sys
import urllib.request
import urllib.error
from urllib.parse import urlparse

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080

EEVO_API_URL = "https://eevo.io/api/v1/systemone"


class FarkleHandler(http.server.SimpleHTTPRequestHandler):
    """Handle static files and proxy Eevo API requests."""
    
    def do_OPTIONS(self):
        """Handle CORS preflight."""
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Max-Age", "86400")
        self.end_headers()
    
    def do_POST(self):
        """Handle POST requests - proxy to Eevo API."""
        if self.path == "/proxy/eevo/api/v1/systemone":
            self.proxy_eevo()
        else:
            self.send_error(404, "Not Found")
    
    def proxy_eevo(self):
        """Proxy request to Eevo API."""
        try:
            # Read request body
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            
            # Get auth header
            auth = self.headers.get("Authorization", "")
            
            # Forward to Eevo
            req = urllib.request.Request(
                EEVO_API_URL,
                data=body,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": auth,
                },
                method="POST"
            )
            
            with urllib.request.urlopen(req, timeout=30) as response:
                result = response.read()
                
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(result)
                
        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8", errors="replace")
            print(f"[ERROR] Eevo API returned {e.code}: {error_body[:500]}")  # server-side debug log
            self.send_response(e.code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({
                "error": f"Eevo API error: {e.code}",
                "details": error_body
            }).encode())
            
        except Exception as e:
            print(f"[ERROR] Proxy exception: {e}")  # server-side debug log
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({
                "error": str(e)
            }).encode())
    
    def end_headers(self):
        """Add CORS headers to all responses."""
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()
    
    def log_message(self, format, *args):
        """Custom log format."""
        print(f"[{self.log_date_time_string()}] {args[0]}")


def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)) or ".")
    
    with http.server.HTTPServer(("", PORT), FarkleHandler) as httpd:
        print(f"🎲 Farkle server running at http://localhost:{PORT}")
        print(f"   Eevo API proxy at http://localhost:{PORT}/api/eevo")
        print(f"   Press Ctrl+C to stop")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n👋 Server stopped")


if __name__ == "__main__":
    main()
