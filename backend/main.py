"""Compatibiliteit voor bestaande imports van ``backend.main``.

Deze module blijft bestaan zodat commando's als
``uvicorn backend.main:app`` blijven werken, maar de daadwerkelijke
applicatielogica is verplaatst naar :mod:`backend.planner`.
"""

from __future__ import annotations

from .planner import app

__all__ = ["app"]
