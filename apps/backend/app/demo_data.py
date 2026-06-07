import random
from typing import Any
from app.models import BuildingSummary, ResourceSummary


def _summary_from_seed(building_id: int, total_hint: int, kind: str) -> ResourceSummary:
    rnd = random.Random(f"{kind}:{building_id}")
    total = max(4, total_hint)
    occupied = rnd.randint(int(total * 0.55), int(total * 0.85))
    free = total - occupied
    public = rnd.randint(int(total * 0.45), int(total * 0.65))
    private = max(0, total - public - rnd.randint(0, max(1, total // 5)))
    unassigned = max(0, total - public - private)
    return ResourceSummary(
        total=total,
        free=free,
        occupied=occupied,
        public=public,
        private=private,
        unassigned=unassigned,
    )


def parking_for_buildings(buildings: list[BuildingSummary]) -> dict[int, ResourceSummary]:
    return {
        b.id: _summary_from_seed(
            building_id=b.id,
            total_hint=(b.apartments or 30) // 2,
            kind="parking",
        )
        for b in buildings
    }


def storage_for_buildings(buildings: list[BuildingSummary]) -> dict[int, ResourceSummary]:
    return {
        b.id: _summary_from_seed(
            building_id=b.id,
            total_hint=(b.apartments or 30) // 3,
            kind="storage",
        )
        for b in buildings
    }


def extract_from_statistics(
    raw_buildings: list[dict[str, Any]],
    stat_type: str,
) -> dict[int, int]:
    result: dict[int, int] = {}
    for item in raw_buildings:
        bid = item.get("id") or item.get("building", {}).get("id")
        if bid is None:
            continue
        for stat in item.get("statistics") or []:
            if stat.get("type") == stat_type:
                result[bid] = int(stat.get("count") or 0)
    return result