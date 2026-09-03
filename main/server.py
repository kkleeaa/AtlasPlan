"""Local development server for AtlasPlan with a same-origin OpenAI proxy."""

from __future__ import annotations

import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


HOST = "127.0.0.1"
PORT = int(os.environ.get("ATLASPLAN_PORT", "4174"))
OPENAI_BASE_URL = "https://api.openai.com/v1/"


class AtlasPlanHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=os.path.dirname(__file__), **kwargs)

    def do_POST(self) -> None:
        if not self.path.startswith("/api/openai/"):
            self.send_error(404, "Endpoint not found")
            return

        endpoint = self.path.removeprefix("/api/openai/")
        if not endpoint or ".." in endpoint:
            self.send_error(400, "Invalid OpenAI endpoint")
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        request_body = self.rfile.read(content_length)
        request_headers = {
            "Authorization": self.headers.get("Authorization", ""),
            "Content-Type": self.headers.get("Content-Type", "application/json"),
        }

        for header in ("OpenAI-Organization", "OpenAI-Project"):
            if self.headers.get(header):
                request_headers[header] = self.headers[header]

        upstream_request = Request(
            OPENAI_BASE_URL + endpoint,
            data=request_body,
            headers=request_headers,
            method="POST",
        )

        try:
            with urlopen(upstream_request, timeout=180) as response:
                self._forward_response(response.status, response.headers, response.read())
        except HTTPError as error:
            self._forward_response(error.code, error.headers, error.read())
        except (URLError, TimeoutError) as error:
            message = (
                '{"error":{"message":"Lidhja me OpenAI dështoi. '
                'Kontrolloni internetin dhe provoni përsëri."}}'
            ).encode("utf-8")
            self._forward_response(502, {"Content-Type": "application/json"}, message)
            print(f"OpenAI proxy connection error: {type(error).__name__}: {error.reason}", flush=True)

    def _forward_response(self, status: int, headers, body: bytes) -> None:
        self.send_response(status)
        self.send_header("Content-Type", headers.get("Content-Type", "application/json"))
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), AtlasPlanHandler)
    print(f"AtlasPlan is running at http://{HOST}:{PORT}/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
