"""Unified backend entrypoint for both planner- and workflow-modes.

The Windows executable (``run_app.py``) and local development both default to
the planner-variant so ``uvicorn backend.server:app`` exposes the full set of
planner routes plus the workflow delegations. Legacy tooling can still opt in
to the original workflow app by setting ``VLIER_BACKEND_MODE=workflow``.
"""

from __future__ import annotations

import os
from typing import Literal, cast

BackendMode = Literal["planner", "workflow"]

_DEFAULT_MODE: BackendMode = "planner"


def _resolve_mode() -> BackendMode:
    value = os.getenv("VLIER_BACKEND_MODE", _DEFAULT_MODE).strip().lower()
    if value in {"workflow", "planner"}:
        return cast(BackendMode, value)
    return _DEFAULT_MODE


mode = _resolve_mode()

if mode == "workflow":
    from .app import app  # noqa: F401
else:
    from .planner import app  # noqa: F401

__all__ = ["app", "mode"]
