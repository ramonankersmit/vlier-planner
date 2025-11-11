"""Compatibiliteitsmodule voor traditionele ``uvicorn`` commando's.

Deze module bestaat om bestaande documentatie/commando's als
``uvicorn app:app --reload`` te laten blijven werken nu de eigenlijke
FastAPI-applicatie via ``backend.server`` wordt aangemaakt.
"""

from backend.server import app

__all__ = ["app"]

