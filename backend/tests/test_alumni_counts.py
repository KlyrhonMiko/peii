import pytest

from core.deps import Principal, get_current_principal
from main import app
from services.rbac_service import DEFAULT_ROLES

pytestmark = pytest.mark.anyio

BSIT = "Bachelor of Science in Information Technology"
BSCS = "Bachelor of Science in Computer Science"
BSN = "Bachelor of Science in Nursing"


def _override_permissions(principal: Principal, permissions: set[str]) -> None:
    restricted = Principal(
        user=principal.user, permissions=frozenset(permissions), access_token="test"
    )

    async def override() -> Principal:
        return restricted

    app.dependency_overrides[get_current_principal] = override


async def _replace(client, counts):
    return await client.put("/api/v1/alumni-counts/", json={"counts": counts})


def test_alumni_counts_capability_is_admin_only_by_default():
    assert "alumni_counts.manage" in DEFAULT_ROLES["admin"]
    assert "alumni_counts.manage" not in DEFAULT_ROLES["researcher"]
    assert "alumni_counts.manage" not in DEFAULT_ROLES["staff"]


async def test_replace_lists_and_audits_alumni_counts(client):
    response = await _replace(
        client,
        [
            {"batch_year": "2025", "degree_program": BSIT, "total": 131},
            {"batch_year": "2025", "degree_program": BSCS, "total": 30},
        ],
    )
    assert response.status_code == 200
    body = response.json()
    assert body["meta"]["request_id"]
    assert {(row["degree_program"], row["total"]) for row in body["data"]} == {
        (BSIT, 131),
        (BSCS, 30),
    }

    listed = (await client.get("/api/v1/alumni-counts/")).json()["data"]
    assert len(listed) == 2

    audits = (
        await client.get("/api/v1/audit-logs/?resource_type=alumni_counts")
    ).json()["data"]
    assert audits[0]["action"] == "replace"
    assert audits[0]["changes"]["after"] == {f"2025|{BSIT}": 131, f"2025|{BSCS}": 30}


async def test_replace_removes_omitted_rows_and_revives_them(client):
    await _replace(
        client,
        [
            {"batch_year": "2025", "degree_program": BSIT, "total": 131},
            {"batch_year": "2025", "degree_program": BSCS, "total": 30},
        ],
    )
    await _replace(client, [{"batch_year": "2025", "degree_program": BSIT, "total": 131}])
    listed = (await client.get("/api/v1/alumni-counts/")).json()["data"]
    assert [row["degree_program"] for row in listed] == [BSIT]

    revived = await _replace(
        client,
        [
            {"batch_year": "2025", "degree_program": BSIT, "total": 131},
            {"batch_year": "2025", "degree_program": BSCS, "total": 31},
        ],
    )
    assert revived.status_code == 200
    assert {row["degree_program"]: row["total"] for row in revived.json()["data"]} == {
        BSIT: 131,
        BSCS: 31,
    }


@pytest.mark.parametrize(
    "counts",
    [
        [{"batch_year": "2025", "degree_program": "BS Astrology", "total": 1}],
        [
            {"batch_year": "2025", "degree_program": BSIT, "total": 1},
            {"batch_year": "2025", "degree_program": BSIT, "total": 2},
        ],
        [{"batch_year": "25", "degree_program": BSIT, "total": 1}],
        [{"batch_year": "2025", "degree_program": BSIT, "total": -1}],
    ],
)
async def test_replace_rejects_invalid_rows(client, counts):
    response = await _replace(client, counts)
    assert response.status_code == 422
    listed = (await client.get("/api/v1/alumni-counts/")).json()["data"]
    assert listed == []


async def test_total_follows_dashboard_filters(client):
    await _replace(
        client,
        [
            {"batch_year": "2024", "degree_program": BSIT, "total": 128},
            {"batch_year": "2025", "degree_program": BSIT, "total": 131},
            {"batch_year": "2025", "degree_program": BSCS, "total": 30},
            {"batch_year": "2025", "degree_program": BSN, "total": 80},
        ],
    )

    async def total(query: str = "") -> int | None:
        response = await client.get(f"/api/v1/alumni-counts/total{query}")
        assert response.status_code == 200
        return response.json()["data"]["alumni_total"]

    assert await total() == 369
    assert await total("?batch=All%20Batches&department=All%20Departments") == 369
    assert await total("?batch=2025") == 241
    assert await total("?batch=2025&department=College%20of%20Computer%20Studies") == 161
    assert await total(f"?department=College%20of%20Computer%20Studies&degree={BSIT}") == 259
    # No stored row covers the filters: the rate is unknown, not 0%.
    assert await total("?batch=2023") is None
    assert await total("?department=College%20of%20Education") is None
    assert await total("?department=Unknown") is None


async def test_alumni_routes_require_their_capabilities(client, principal):
    _override_permissions(principal, {"portal.access", "survey_responses.read_aggregates"})
    assert (await client.get("/api/v1/alumni-counts/")).status_code == 403
    assert (await _replace(client, [])).status_code == 403
    assert (await client.get("/api/v1/alumni-counts/total")).status_code == 200

    _override_permissions(principal, {"portal.access", "alumni_counts.manage"})
    assert (await client.get("/api/v1/alumni-counts/")).status_code == 200
    assert (await client.get("/api/v1/alumni-counts/total")).status_code == 403


async def test_total_breaks_down_by_cohort_and_college(client):
    await _replace(
        client,
        [
            {"batch_year": "2024", "degree_program": BSIT, "total": 128},
            {"batch_year": "2025", "degree_program": BSIT, "total": 131},
            {"batch_year": "2025", "degree_program": BSCS, "total": 30},
            {"batch_year": "2025", "degree_program": BSN, "total": 80},
        ],
    )
    data = (await client.get("/api/v1/alumni-counts/total")).json()["data"]
    assert data["by_batch"] == {"2024": 128, "2025": 241}
    assert data["by_batch_college"] == {
        "2024": {"College of Computer Studies": 128},
        "2025": {"College of Computer Studies": 161, "College of Nursing": 80},
    }
    assert data["by_batch_degree"] == {
        "2024": {BSIT: 128},
        "2025": {BSIT: 131, BSCS: 30, BSN: 80},
    }

    filtered = (
        await client.get("/api/v1/alumni-counts/total?department=College%20of%20Nursing")
    ).json()["data"]
    assert filtered["by_batch"] == {"2025": 80}
    assert filtered["by_batch_college"] == {"2025": {"College of Nursing": 80}}
    assert filtered["by_batch_degree"] == {"2025": {BSN: 80}}

    empty = (await client.get("/api/v1/alumni-counts/total?batch=2023")).json()["data"]
    assert empty == {
        "alumni_total": None,
        "by_batch": {},
        "by_batch_college": {},
        "by_batch_degree": {},
        "batch": "2023",
        "department": None,
        "degree": None,
    }


async def test_degree_coverage_preserves_explicit_zero_and_omits_unknown_cells(client):
    await _replace(client, [{"batch_year": "2025", "degree_program": BSIT, "total": 0}])
    data = (await client.get("/api/v1/alumni-counts/total")).json()["data"]
    # Zero is known population; an absent BSCS row remains unknown even in the same college.
    assert data["by_batch_degree"] == {"2025": {BSIT: 0}}
    assert data["alumni_total"] == 0
