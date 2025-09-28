"""Utilities for discovering the latest GitHub release for Vlier Planner."""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

import httpx
from packaging.version import InvalidVersion, Version

OWNER = "ramonankersmit"
REPO = "vlier-planner"
API_ROOT = "https://api.github.com"


def _headers() -> Dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "VlierPlanner-Updater",
    }
    token = os.getenv("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _parse_version(value: str) -> Version:
    cleaned = (value or "").strip()
    if cleaned.lower().startswith("v"):
        cleaned = cleaned[1:]
    return Version(cleaned)


def fetch_latest_release(include_prereleases: bool = True) -> Optional[Dict[str, Any]]:
    """Return metadata about the latest GitHub release or tag."""

    response = httpx.get(
        f"{API_ROOT}/repos/{OWNER}/{REPO}/releases",
        headers=_headers(),
        timeout=15,
    )
    response.raise_for_status()

    candidates: List[Dict[str, Any]] = []
    for release in response.json():
        if release.get("draft"):
            continue
        if not include_prereleases and release.get("prerelease"):
            continue
        tag = release.get("tag_name") or ""
        try:
            version = _parse_version(tag)
        except InvalidVersion:
            continue

        assets = release.get("assets") or []
        windows_asset = next(
            (
                asset
                for asset in assets
                if str(asset.get("name", "")).lower().endswith(".exe")
            ),
            None,
        )
        candidates.append(
            {
                "version": version,
                "asset_url": windows_asset.get("browser_download_url") if windows_asset else None,
                "asset_name": windows_asset.get("name") if windows_asset else None,
                "notes": release.get("body"),
            }
        )

    if not candidates:
        tags_response = httpx.get(
            f"{API_ROOT}/repos/{OWNER}/{REPO}/tags",
            headers=_headers(),
            timeout=15,
        )
        tags_response.raise_for_status()
        for tag in tags_response.json():
            try:
                version = _parse_version(tag.get("name", ""))
            except InvalidVersion:
                continue
            candidates.append({"version": version, "asset_url": None, "asset_name": None, "notes": None})

    if not candidates:
        return None

    latest = max(candidates, key=lambda item: item["version"])
    return {
        "version": str(latest["version"]),
        "asset_url": latest.get("asset_url"),
        "asset_name": latest.get("asset_name"),
        "notes": latest.get("notes"),
    }


def get_update_info(current_version: str) -> Dict[str, Any]:
    """Compare ``current_version`` with GitHub and describe the latest release."""

    try:
        current = _parse_version(current_version)
    except InvalidVersion:
        current = Version("0")

    latest = fetch_latest_release(include_prereleases=True)
    if not latest:
        return {
            "current": str(current),
            "latest": None,
            "has_update": False,
            "asset_url": None,
            "asset_name": None,
            "notes": None,
        }

    try:
        latest_version = _parse_version(str(latest.get("version", "")))
    except InvalidVersion:
        return {
            "current": str(current),
            "latest": None,
            "has_update": False,
            "asset_url": None,
            "asset_name": None,
            "notes": latest.get("notes"),
        }

    return {
        "current": str(current),
        "latest": str(latest_version),
        "has_update": latest_version > current,
        "asset_url": latest.get("asset_url"),
        "asset_name": latest.get("asset_name"),
        "notes": latest.get("notes"),
    }


__all__ = ["fetch_latest_release", "get_update_info"]
