from typing import Any
from app.models import BuildingSummary, EmergencyState, LobbyOverview, Metric, ResourceSummary
from app.ujin_client import UjinClient


def _calc_metrics(buildings: list[BuildingSummary]) -> list[Metric]:
    apartments = sum(b.apartments or 0 for b in buildings)
    p_total = sum(b.parking.total for b in buildings)
    p_free = sum(b.parking.free for b in buildings)
    s_total = sum(b.storage.total for b in buildings)
    s_free = sum(b.storage.free for b in buildings)
    return [
        Metric(label="Buildings", value=len(buildings)),
        Metric(label="Apartments", value=apartments),
        Metric(
            label="Free parking",
            value=p_free,
            total=p_total,
            status="warning" if p_total and p_free / p_total < 0.1 else "ok",
        ),
        Metric(
            label="Free storage",
            value=s_free,
            total=s_total,
            status="warning" if s_total and s_free / s_total < 0.1 else "ok",
        ),
    ]


def build_overview_from_cache(cache: dict[str, Any]) -> LobbyOverview | None:
    buildings: list[BuildingSummary] | None = cache.get("buildings")
    if not buildings:
        return None

    parking: dict[int, ResourceSummary] = cache.get("parking", {})
    storage: dict[int, ResourceSummary] = cache.get("storage", {})
    complexes: list[dict] = cache.get("complexes", [])
    news = cache.get("news", [])

    enriched = [
        b.model_copy(update={
            "parking": parking.get(b.id, b.parking),
            "storage": storage.get(b.id, b.storage),
        })
        for b in buildings
    ]

    return LobbyOverview(
        complexes_count=len(complexes),
        buildings=enriched,
        news=news,
        metrics=_calc_metrics(enriched),
    )


class EmergencyStore:
    def __init__(self) -> None:
        self._state = EmergencyState()

    def get(self) -> EmergencyState:
        return self._state

    def activate(self, state: EmergencyState) -> EmergencyState:
        self._state = state.model_copy(update={"active": True})
        return self._state

    def deactivate(self) -> EmergencyState:
        self._state = EmergencyState()
        return self._state