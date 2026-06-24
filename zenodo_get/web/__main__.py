#!/usr/bin/env python3
"""Entry point for `python -m zenodo_get.web`."""

import os

from zenodo_get.web import app, init_web_client

if __name__ == "__main__":
    init_web_client()
    port = int(os.environ.get("ZENODO_WEB_PORT", "5001"))
    debug = os.environ.get("ZENODO_WEB_DEBUG", "").lower() in ("1", "true", "yes")
    app.run(host="127.0.0.1", port=port, debug=debug, threaded=True)
