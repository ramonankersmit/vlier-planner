"""Unified backend entrypoint that supports planner and workflow modes."""

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
