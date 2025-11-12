"""Compatibiliteitsmodule voor traditionele ``uvicorn`` commando's.

``uvicorn app:app --reload`` blijft dankzij deze module werken. De
onderliggende FastAPI-app wordt direct uit :mod:`backend.app`
geëxporteerd.
"""

from backend.app import app

__all__ = ["app"]

