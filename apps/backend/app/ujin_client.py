import asyncio
import logging
from html.parser import HTMLParser
from typing import Any
import httpx
from app.config import Settings
from app.models import BuildingSummary, NewsSummary, ResourceSummary

logger = logging.getLogger(__name__)


class UjinError(Exception):
    pass

class UjinAuthError(UjinError):
    pass

class UjinNotFoundError(UjinError):
    pass

class UjinTimeoutError(UjinError):
    pass

class UjinUpstreamError(UjinError):
    pass

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
        self._max_retries = settings.ujin_max_retries
        self._backoff = settings.ujin_retry_backoff

    async def _get(self, path: str, params: dict[str, Any]) -> dict[str, Any]:
        attempt = 0
        last_exc: Exception | None = None
        while attempt <= self._max_retries:
            try:
                async with httpx.AsyncClient(
                    base_url=self._base_url,
                    timeout=self._timeout,
                    headers={"Referer": self._referer},
                ) as client:
                    response = await client.get(path, params=params)
                return self._parse(path, response)
            except (httpx.TimeoutException, UjinUpstreamError) as exc:
                last_exc = exc
                if attempt == self._max_retries:
                    break
                delay = self._backoff * (2 ** attempt)
                logger.warning("Ujin %s failed (%s) — retry in %.1fs", path, exc, delay)
                await asyncio.sleep(delay)
                attempt += 1
        if isinstance(last_exc, httpx.TimeoutException):
            raise UjinTimeoutError(f"Timeout calling {path}") from last_exc
        if last_exc is not None:
            raise last_exc
        raise UjinUpstreamError(f"Unknown failure calling {path}")

    def _parse(self, path: str, response: httpx.Response) -> dict[str, Any]:
        if response.status_code == 401:
            raise UjinAuthError(f"401 on {path}: token invalid or expired")
        if response.status_code >= 500:
            raise UjinUpstreamError(f"{response.status_code} on {path}")
        try:
            payload = response.json()
        except Exception as exc:
            raise UjinUpstreamError(f"Non-JSON response from {path}") from exc

        if not isinstance(payload, dict):
            raise UjinUpstreamError(f"Unexpected payload shape from {path}")

        if payload.get("error"):
            msg = (payload.get("message") or "").strip()
            if "could not be found" in msg.lower() or response.status_code == 404:
                raise UjinNotFoundError(f"{path}: {msg or 'route not found'}")
            raise UjinUpstreamError(f"{path}: {msg or 'upstream business error'}")

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

    async def buildings_raw(self, token: str) -> list[dict[str, Any]]:
        payload = await self._get(
            "/api/v1/buildings/get-list-crm",
            {"token": token, "per_page": 1000, "page": 1},
        )
        return payload.get("data", {}).get("buildings", [])

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