import logging
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import httpx

logger = logging.getLogger(__name__)

_OWM_BASE = "https://api.openweathermap.org"
_MOSCOW_TZ = ZoneInfo("Europe/Moscow")
_RU_DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]


def _icon_url(icon: str) -> str:
    return f"https://openweathermap.org/img/wn/{icon}@2x.png"


def _local_dt(ts: int) -> datetime:
    return datetime.fromtimestamp(ts, tz=timezone.utc).astimezone(_MOSCOW_TZ)


class WeatherClient:
    def __init__(self, api_key: str, timeout: float = 10.0) -> None:
        self._key = api_key
        self._client = httpx.AsyncClient(timeout=timeout)
        self._geocache: dict[str, tuple[float, float]] = {}

    async def close(self) -> None:
        await self._client.aclose()

    async def geocode(self, address: str) -> tuple[float, float]:
        if address in self._geocache:
            return self._geocache[address]
        resp = await self._client.get(
            f"{_OWM_BASE}/geo/1.0/direct",
            params={"q": address, "limit": 1, "appid": self._key, "countrycodes": "RU"},
        )
        resp.raise_for_status()
        data = resp.json()
        if not data:
            raise ValueError(f"Geocoding returned no results for: {address!r}")
        coords = float(data[0]["lat"]), float(data[0]["lon"])
        self._geocache[address] = coords
        logger.info("Geocoded %r → lat=%.4f lon=%.4f", address, *coords)
        return coords

    async def fetch_current(self, lat: float, lon: float) -> dict:
        resp = await self._client.get(
            f"{_OWM_BASE}/data/2.5/weather",
            params={"lat": lat, "lon": lon, "appid": self._key, "units": "metric", "lang": "ru"},
        )
        resp.raise_for_status()
        raw = resp.json()
        dt_local = _local_dt(raw["dt"])
        return {
            "temp": round(raw["main"]["temp"], 1),
            "feels_like": round(raw["main"]["feels_like"], 1),
            "temp_min": round(raw["main"]["temp_min"], 1),
            "temp_max": round(raw["main"]["temp_max"], 1),
            "humidity": raw["main"]["humidity"],
            "pressure": raw["main"]["pressure"],
            "wind_speed": round(raw["wind"]["speed"], 1),
            "description": raw["weather"][0]["description"].capitalize(),
            "icon": raw["weather"][0]["icon"],
            "icon_url": _icon_url(raw["weather"][0]["icon"]),
            "location": raw.get("name", ""),
            "dt": dt_local.isoformat(),
        }

    async def fetch_hourly(self, lat: float, lon: float) -> dict:
        resp = await self._client.get(
            f"{_OWM_BASE}/data/2.5/forecast",
            params={"lat": lat, "lon": lon, "appid": self._key, "units": "metric", "lang": "ru", "cnt": 4},
        )
        resp.raise_for_status()
        raw = resp.json()
        items = []
        for entry in raw["list"]:
            dt_local = _local_dt(entry["dt"])
            items.append({
                "dt": dt_local.isoformat(),
                "hour": dt_local.strftime("%H:%M"),
                "temp": round(entry["main"]["temp"], 1),
                "feels_like": round(entry["main"]["feels_like"], 1),
                "humidity": entry["main"]["humidity"],
                "wind_speed": round(entry["wind"]["speed"], 1),
                "description": entry["weather"][0]["description"].capitalize(),
                "icon": entry["weather"][0]["icon"],
                "icon_url": _icon_url(entry["weather"][0]["icon"]),
                "pop": round(entry.get("pop", 0) * 100),
            })
        return {"items": items}

    async def fetch_daily(self, lat: float, lon: float) -> dict:
        resp = await self._client.get(
            f"{_OWM_BASE}/data/2.5/forecast",
            params={"lat": lat, "lon": lon, "appid": self._key, "units": "metric", "lang": "ru", "cnt": 40},
        )
        resp.raise_for_status()
        raw = resp.json()
        days: dict[str, dict] = {}
        for entry in raw["list"]:
            dt_local = _local_dt(entry["dt"])
            date_str = dt_local.strftime("%Y-%m-%d")
            temp = entry["main"]["temp"]
            pop = entry.get("pop", 0)
            if date_str not in days:
                days[date_str] = {
                    "date": date_str,
                    "day_name": _RU_DAYS[dt_local.weekday()],
                    "temp_min": temp,
                    "temp_max": temp,
                    "pop_max": pop,
                    "description": entry["weather"][0]["description"].capitalize(),
                    "icon": entry["weather"][0]["icon"],
                    "icon_url": _icon_url(entry["weather"][0]["icon"]),
                }
            else:
                days[date_str]["temp_min"] = min(days[date_str]["temp_min"], temp)
                days[date_str]["temp_max"] = max(days[date_str]["temp_max"], temp)
                days[date_str]["pop_max"] = max(days[date_str]["pop_max"], pop)

        items = [
            {
                **v,
                "temp_min": round(v["temp_min"], 1),
                "temp_max": round(v["temp_max"], 1),
                "pop_max": round(v["pop_max"] * 100),
            }
            for v in list(days.values())[:7]
        ]
        return {"items": items}
