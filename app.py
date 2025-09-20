"""Compatibiliteitsmodule voor traditionele ``uvicorn`` commando's.

Deze module bestaat om bestaande documentatie/commando's als
``uvicorn app:app --reload`` te laten blijven werken nu de eigenlijke
FastAPI-applicatie in ``backend.app`` leeft.
"""

from backend.app import app

__all__ = ["app"]

