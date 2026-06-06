from html.parser import HTMLParser
from typing import Any
import httpx
from app.config import Settings
from app.models import BuildingSummary, NewsSummary, ResourceSummary


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        if data.strip():
            self.parts.append(data.strip())

    def text(self) -> str:
        return " ".join(self.parts)


def strip_html(value: str | None) -> str | None:
    if not value:
        return value
    parser = _TextExtractor()
    parser.feed(value)
    return parser.text()


class UjinClient:
    def __init__(self, settings: Settings) -> None:
        self._base_url = settings.ujin_api_base_url.rstrip("/")
        self._referer = settings.ujin_referer
        self._timeout = settings.ujin_request_timeout

    async def _get(self, path: str, params: dict[str, Any]) -> dict[str, Any]:
        async with httpx.AsyncClient(
            base_url=self._base_url,
            timeout=self._timeout,
            headers={"Referer": self._referer},
        ) as client:
            response = await client.get(path, params=params)
            response.raise_for_status()
            payload = response.json()
            if payload.get("error"):
                raise httpx.HTTPStatusError(
                    payload.get("message", "Ujin API error"),
                    request=response.request,
                    response=response,
                )
            return payload

    async def complexes(self, token: str) -> list[dict[str, Any]]:
        payload = await self._get("/api/v1/complex/list", {"token": token})
        return payload.get("data", {}).get("items", [])

    async def buildings(self, token: str) -> list[BuildingSummary]:
        payload = await self._get(
            "/api/v1/buildings/get-list-crm",
            {"token": token, "per_page": 1000, "page": 1},
        )
        items = payload.get("data", {}).get("buildings", [])
        return [self._building_summary(item) for item in items]

    async def parking(self, token: str) -> dict[int, ResourceSummary]:
        payload = await self._get("/api/v1/parking/list", {"token": token})
        return self._resource_by_building(payload, resource_key="spots")

    async def storage(self, token: str) -> dict[int, ResourceSummary]:
        payload = await self._get("/api/v1/storage/list", {"token": token})
        return self._resource_by_building(payload, resource_key="rooms")

    async def news(self, token: str) -> list[NewsSummary]:
        payload = await self._get("/api/v1/news/list", {"token": token})
        items = payload.get("data", {}).get("items", [])
        return [self._news_summary(item) for item in items]

    def _building_summary(self, item: dict[str, Any]) -> BuildingSummary:
        building = item.get("building", {})
        meters = building.get("meters") or {}
        manual_update = meters.get("manual-update") or {}
        address = building.get("address") or {}
        return BuildingSummary(
            id=item.get("id") or building.get("id"),
            complex_id=item.get("complex", {}).get("id", 0),
            title=building.get("title", "Building"),
            address=address.get("fullAddress"),
            floors=building.get("floor"),
            apartments=building.get("apartmentCount"),
            entrances=building.get("entranceCount"),
            security_number=building.get("security_number"),
            guest_scud_pass_limit=building.get("guest_scud_pass_limit"),
            meters_mode=meters.get("mode"),
            meter_push_day=manual_update.get("push_day_of_month"),
        )

    def _news_summary(self, item: dict[str, Any]) -> NewsSummary:
        text = strip_html(item.get("text"))
        priority = "high" if self._is_priority_news(item.get("title"), text) else "normal"
        return NewsSummary(
            id=item["id"],
            title=item.get("title", "News"),
            date=item.get("date"),
            text=text,
            buildings=[building.get("title", "") for building in item.get("buildings", [])],
            priority=priority,
        )

    def _resource_by_building(
        self,
        payload: dict[str, Any],
        resource_key: str,
    ) -> dict[int, ResourceSummary]:
        result: dict[int, ResourceSummary] = {}
        for complex_item in payload.get("data", {}).get("items", []):
            for building in complex_item.get("buildings", []):
                building_id = building.get("building_id")
                if building_id is None:
                    continue
                summary = result.setdefault(building_id, ResourceSummary())
                for zone in building.get("zones", []):
                    self._add_resources(summary, zone.get(resource_key, []))
                self._add_resources(summary, building.get(resource_key, []))
        return result

    def _add_resources(self, summary: ResourceSummary, resources: list[dict[str, Any]]) -> None:
        for resource in resources:
            summary.total += 1
            status = resource.get("status")
            assignment_type = resource.get("assignment_type")
            if status == "free":
                summary.free += 1
            if status == "occupied":
                summary.occupied += 1
            if assignment_type == "public":
                summary.public += 1
            if assignment_type == "private":
                summary.private += 1
            if assignment_type == "unassigned":
                summary.unassigned += 1

    def _is_priority_news(self, title: str | None, text: str | None) -> bool:
        value = f"{title or ''} {text or ''}".lower()
        keywords = ("шлагбаум", "авар", "вода", "свет", "ремонт", "эвакуац")
        return any(keyword in value for keyword in keywords)