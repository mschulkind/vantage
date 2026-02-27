"""Build version for cache-busting and protocol version checks.

This value is updated at build time by the frontend build process.
During development it uses a timestamp-based fallback.
"""

import time

# Updated at build time; fallback to process start time for dev
_PROCESS_START = str(int(time.time()))
BUILD_VERSION: str = _PROCESS_START
