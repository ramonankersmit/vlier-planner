from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.app import app
from backend.school_vacations import parse_school_vacations, fetch_school_vacations


SAMPLE_HTML = Path("tests/data/school_vacations_sample.html").read_text(encoding="utf-8")


def test_parse_school_vacations_sample():
    vacations = parse_school_vacations(SAMPLE_HTML, "2025-2026", "https://example")
    assert len(vacations) == 15
    first = vacations[0]
    assert first.name == "Herfstvakantie"
    assert first.region.lower() == "noord"
    assert first.start_date == "2025-10-18"
    assert first.end_date == "2025-10-26"
    assert first.school_year == "2025-2026"
    assert first.source == "https://example"
    assert "18 oktober" in first.label
    assert "advies" not in first.label.lower()


@pytest.mark.asyncio
async def test_fetch_school_vacations_with_stub():
    async def fake_get(url: str) -> str:
        assert "2025-2026" in url
        return SAMPLE_HTML

    data = await fetch_school_vacations("2025-2026", http_get=fake_get)
    assert data["schoolYear"] == "2025-2026"
    assert data["source"].endswith("2025-2026")
    assert len(data["vacations"]) == 15


def test_api_school_vacations(monkeypatch):
    async def fake_fetch(school_year: str):
        assert school_year == "2025-2026"
        return {
            "schoolYear": school_year,
            "source": "https://example", 
            "retrievedAt": "2024-01-01T00:00:00+00:00",
            "title": "Schoolvakanties",
            "vacations": [
                {
                    "id": "herfst-noord",
                    "name": "Herfstvakantie",
                    "region": "Noord",
                    "start_date": "2025-10-18",
                    "end_date": "2025-10-26",
                    "school_year": school_year,
                    "source": "https://example",
                    "label": "18 oktober 2025 t/m 26 oktober 2025",
                    "raw_text": "18 oktober 2025 t/m 26 oktober 2025",
                    "notes": None,
                }
            ],
        }

    monkeypatch.setattr("backend.app.fetch_school_vacations", fake_fetch)
    client = TestClient(app)
    response = client.get("/api/school-vacations", params={"schoolYear": "2025-2026"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["schoolYear"] == "2025-2026"
    assert payload["vacations"] == [
        {
            "id": "herfst-noord",
            "name": "Herfstvakantie",
            "region": "Noord",
            "startDate": "2025-10-18",
            "endDate": "2025-10-26",
            "schoolYear": "2025-2026",
            "source": "https://example",
            "label": "18 oktober 2025 t/m 26 oktober 2025",
            "rawText": "18 oktober 2025 t/m 26 oktober 2025",
            "notes": None,
        }
    ]
