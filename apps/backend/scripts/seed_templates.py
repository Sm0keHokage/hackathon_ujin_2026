"""Засевает примеры шаблонов дашбордов через admin API.

Запуск:
    ADMIN_TOKEN=demo-admin-token \
    API_BASE_URL=http://127.0.0.1:8000 \
    python3 apps/backend/scripts/seed_templates.py

Идемпотентен — если шаблон с таким же именем уже есть, пересоздавать не будет.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone


API_BASE_URL = os.environ.get("API_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "demo-admin-token")


def layout(x1: int, y1: int, x2: int, y2: int) -> dict:
    return {"topLeft": {"x": x1, "y": y1}, "bottomRight": {"x": x2, "y": y2}}


def clock_tile(tile_id: str, title: str, x1: int, y1: int, x2: int, y2: int, subtitle: str | None = None) -> dict:
    tile = {
        "id": tile_id,
        "type": "clock",
        "title": title,
        "timezone": "Europe/Moscow",
        "layout": layout(x1, y1, x2, y2),
    }
    if subtitle:
        tile["subtitle"] = subtitle
    return tile


def metric_tile(
    tile_id: str,
    title: str,
    value: str,
    x1: int,
    y1: int,
    x2: int,
    y2: int,
    *,
    unit: str | None = None,
    caption: str | None = None,
    status: str | None = None,
) -> dict:
    tile = {
        "id": tile_id,
        "type": "metric",
        "title": title,
        "value": value,
        "layout": layout(x1, y1, x2, y2),
    }
    if unit:
        tile["unit"] = unit
    if caption:
        tile["caption"] = caption
    if status:
        tile["status"] = status
    return tile


def text_tile(
    tile_id: str,
    title: str,
    body: str,
    x1: int,
    y1: int,
    x2: int,
    y2: int,
    *,
    footer: str | None = None,
    accent: str | None = None,
) -> dict:
    tile = {
        "id": tile_id,
        "type": "text",
        "title": title,
        "body": body,
        "layout": layout(x1, y1, x2, y2),
    }
    if footer:
        tile["footer"] = footer
    if accent:
        tile["accent"] = accent
    return tile


def notice_list_tile(
    tile_id: str,
    title: str,
    items: list[dict],
    x1: int,
    y1: int,
    x2: int,
    y2: int,
) -> dict:
    return {
        "id": tile_id,
        "type": "noticeList",
        "title": title,
        "items": items,
        "layout": layout(x1, y1, x2, y2),
    }


def service_status_tile(
    tile_id: str,
    title: str,
    items: list[dict],
    x1: int,
    y1: int,
    x2: int,
    y2: int,
) -> dict:
    return {
        "id": tile_id,
        "type": "serviceStatus",
        "title": title,
        "items": items,
        "layout": layout(x1, y1, x2, y2),
    }


def base_config(title: str, address: str, tiles: list[dict]) -> dict:
    return {
        "id": title.lower().replace(" ", "-"),
        "title": title,
        "address": address,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "grid": {"columns": 9, "rows": 16, "gap": 16},
        "tiles": tiles,
    }


TEMPLATES = [
    {
        "name": "Холл — основной",
        "config_json": base_config(
            "ЖК «Космонавтов»",
            "шоссе Космонавтов, 111",
            [
                clock_tile("clock", "Сегодня", 1, 1, 9, 3, subtitle="Пермь"),
                metric_tile(
                    "parking",
                    "Свободные парковки",
                    "18",
                    1, 4, 5, 6,
                    unit="из 28",
                    caption="2 здания",
                    status="success",
                ),
                metric_tile(
                    "storage",
                    "Свободные кладовые",
                    "12",
                    6, 4, 9, 6,
                    unit="из 24",
                    status="success",
                ),
                notice_list_tile(
                    "news",
                    "Новости УК",
                    [
                        {
                            "id": "n-1",
                            "title": "Плановое отключение горячей воды",
                            "text": "12 июня с 09:00 до 18:00 — работы на ЦТП. Запаситесь водой заранее.",
                            "severity": "warning",
                        },
                        {
                            "id": "n-2",
                            "title": "Открыта запись на детский кружок",
                            "text": "Дворовый клуб приглашает детей 6–10 лет. Подробности у консьержа.",
                            "severity": "info",
                        },
                    ],
                    1, 7, 9, 12,
                ),
                text_tile(
                    "rules",
                    "Правила ЖК",
                    "Курение, шумные работы после 21:00, выгул собак без поводка — запрещены.",
                    1, 13, 5, 14,
                ),
                text_tile(
                    "trash",
                    "Вывоз мусора",
                    "Пн, Ср, Пт — 07:00. Крупногабарит — суббота.",
                    6, 13, 9, 14,
                ),
                text_tile(
                    "emergency-contacts",
                    "Аварийная служба",
                    "+7 (342) 200-00-00",
                    1, 15, 9, 16,
                    footer="круглосуточно",
                    accent="info",
                ),
            ],
        ),
    },
    {
        "name": "Информационное табло",
        "config_json": base_config(
            "ЖК «Космонавтов»",
            "шоссе Космонавтов, 111",
            [
                clock_tile("clock", "Сейчас", 1, 1, 4, 3),
                service_status_tile(
                    "services",
                    "Сервисы дома",
                    [
                        {"id": "s-1", "label": "Лифт 1-го подъезда", "value": "работает", "status": "normal"},
                        {"id": "s-2", "label": "Лифт 2-го подъезда", "value": "ТО до 14:00", "status": "planned"},
                        {"id": "s-3", "label": "Шлагбаум", "value": "норма", "status": "normal"},
                        {"id": "s-4", "label": "Видеонаблюдение", "value": "норма", "status": "normal"},
                    ],
                    5, 1, 9, 5,
                ),
                notice_list_tile(
                    "news",
                    "Главные новости",
                    [
                        {
                            "id": "n-1",
                            "title": "Собрание собственников",
                            "text": "15 июня в 19:00 в холле 1-го подъезда. Повестка — выбор подрядчика по благоустройству.",
                            "severity": "warning",
                        },
                        {
                            "id": "n-2",
                            "title": "Новые правила доступа",
                            "text": "С 10 июня вход в паркинг — только по индивидуальному ключу. Получить у консьержа.",
                            "severity": "info",
                        },
                        {
                            "id": "n-3",
                            "title": "Subscription на коммунальные",
                            "text": "Подключите автосписание через личный кабинет, чтобы не получать пени.",
                            "severity": "info",
                        },
                    ],
                    1, 6, 9, 12,
                ),
                text_tile(
                    "rules",
                    "Правила проживания",
                    "Шумные работы 09:00–13:00 и 15:00–19:00 по будням. Соблюдайте тишину после 23:00.",
                    1, 13, 9, 14,
                ),
                text_tile(
                    "emergency-contacts",
                    "Аварийная служба",
                    "+7 (342) 200-00-00",
                    1, 15, 9, 16,
                    footer="круглосуточно",
                    accent="info",
                ),
            ],
        ),
    },
    {
        "name": "Паркинг и навигация",
        "config_json": base_config(
            "Паркинг P1",
            "шоссе Космонавтов, 111",
            [
                clock_tile("clock", "Сейчас", 1, 1, 9, 3),
                metric_tile(
                    "parking-big",
                    "Свободные места",
                    "18",
                    1, 4, 9, 9,
                    unit="из 28",
                    caption="публичная зона",
                    status="success",
                ),
                metric_tile(
                    "storage",
                    "Свободные кладовые",
                    "12",
                    1, 10, 5, 12,
                    unit="из 24",
                ),
                metric_tile(
                    "guests",
                    "Гостевые пропуска сегодня",
                    "3",
                    6, 10, 9, 12,
                    caption="лимит 5",
                ),
                text_tile(
                    "navigation",
                    "Как пройти",
                    "Лифты — через вторую дверь налево. Выход во двор — по указателям «Двор».",
                    1, 13, 9, 14,
                ),
                text_tile(
                    "security",
                    "Охрана паркинга",
                    "+7 (342) 200-00-00 доб. 2",
                    1, 15, 9, 16,
                    accent="info",
                    footer="круглосуточно",
                ),
            ],
        ),
    },
    {
        "name": "Минимальный — часы и контакты",
        "config_json": base_config(
            "ЖК «Космонавтов»",
            "шоссе Космонавтов, 111",
            [
                clock_tile("clock", "Сейчас", 1, 1, 9, 8, subtitle="Пермь"),
                text_tile(
                    "welcome",
                    "Добро пожаловать",
                    "Если вам нужна помощь — обратитесь к консьержу или нажмите кнопку у домофона.",
                    1, 9, 9, 12,
                ),
                text_tile(
                    "emergency-contacts",
                    "Аварийная служба",
                    "+7 (342) 200-00-00",
                    1, 13, 9, 16,
                    footer="круглосуточно",
                    accent="info",
                ),
            ],
        ),
    },
]


def request(method: str, path: str, body: dict | None = None) -> tuple[int, dict | list | None]:
    url = f"{API_BASE_URL}{path}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"X-Admin-Token": ADMIN_TOKEN}
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read()
            return resp.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        return exc.code, json.loads(raw) if raw else None
    except urllib.error.URLError as exc:
        print(f"[error] {method} {path}: {exc.reason}", file=sys.stderr)
        sys.exit(2)


def main() -> int:
    status, existing = request("GET", "/api/templates")
    if status != 200 or not isinstance(existing, list):
        print(f"[error] GET /api/templates failed: HTTP {status} -> {existing}", file=sys.stderr)
        return 1

    by_name = {tpl.get("name"): tpl for tpl in existing}

    created = 0
    skipped = 0
    failed = 0
    for tpl in TEMPLATES:
        name = tpl["name"]
        if name in by_name:
            print(f"  · skip   {name} (id={by_name[name]['id']})")
            skipped += 1
            continue

        status, payload = request("POST", "/api/templates", body=tpl)
        if status == 201 and isinstance(payload, dict):
            print(f"  ✓ create {name} (id={payload['id']})")
            created += 1
        else:
            print(f"  ✗ fail   {name}: HTTP {status} -> {payload}")
            failed += 1

    print(f"\nИтого: создано {created}, пропущено {skipped}, ошибок {failed}.")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
