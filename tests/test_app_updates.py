from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import backend.app as backend_app
from backend.updater import InstallResult, UpdateInfo


@pytest.fixture()
def api_client(tmp_path):
    original_storage_base = backend_app.STORAGE_BASE
    original_storage = backend_app.STORAGE
    original_state_file = backend_app.STATE_FILE
    original_pending = backend_app.PENDING_DIR

    backend_app.STORAGE_BASE = tmp_path
    backend_app.STORAGE = tmp_path / "uploads"
    backend_app.STATE_FILE = tmp_path / "state.json"
    backend_app.PENDING_DIR = tmp_path / "pending"
    backend_app._ensure_state_dir()
    backend_app.GUIDES.clear()
    backend_app.DOCS.clear()
    backend_app.PENDING_PARSES.clear()

    client = TestClient(backend_app.app)

    yield client

    backend_app.GUIDES.clear()
    backend_app.DOCS.clear()
    backend_app.PENDING_PARSES.clear()
    backend_app.STORAGE = original_storage
    backend_app.STATE_FILE = original_state_file
    backend_app.PENDING_DIR = original_pending
    backend_app.STORAGE_BASE = original_storage_base
    backend_app._ensure_state_dir()
    backend_app._load_state()
    backend_app._load_pending()


def test_update_check_endpoint_forces_refresh(api_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    captured_force: list[bool] = []

    def fake_check_for_update(*, force: bool = False):
        captured_force.append(force)
        return None

    monkeypatch.setattr(backend_app.updater, "check_for_update", fake_check_for_update)

    response = api_client.get("/api/system/update")
    assert response.status_code == 200
    body = response.json()
    assert body["updateAvailable"] is False
    assert captured_force == [True]


def test_update_install_endpoint_forces_refresh(
    api_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    sample_update = UpdateInfo(
        current_version="1.0.0",
        latest_version="1.1.0",
        asset_name="VlierPlanner-Setup-1.1.0.exe",
        download_url="https://example.invalid/update.exe",
        release_notes=None,
        sha256=None,
    )

    captured_force: list[bool] = []

    def fake_check_for_update(*, force: bool = False):
        captured_force.append(force)
        return sample_update

    def fake_install_update(info: UpdateInfo, *, silent: bool | None = None):
        assert info is sample_update
        return InstallResult(installer_path=Path("/tmp/installer.exe"), restart_initiated=True)

    monkeypatch.setattr(backend_app.updater, "check_for_update", fake_check_for_update)
    monkeypatch.setattr(backend_app.updater, "install_update", fake_install_update)

    response = api_client.post(
        "/api/system/update",
        json={"version": sample_update.latest_version, "silent": True},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "started"
    assert captured_force == [True]
