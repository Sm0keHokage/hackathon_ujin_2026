# hackathon_ujin_2026

Проект для хакатона Ujin: экран умного лобби для ЖК и простая админка для управления экранами.

Что есть внутри:

- `backend` - API на FastAPI, собирает данные, хранит их в Postgres и отдает конфиг дашборда.
- `frontend` - экран табло для жителей.
- `admin` - админка для экранов, шаблонов и режима ЧС.

## Быстрый запуск

Нужен Docker и Docker Compose.

1. Проверьте, что в корне проекта есть файл `.env`.
2. Запустите проект:

```bash
docker compose up --build
```

3. Откройте в браузере:

- табло: http://localhost
- админка: http://localhost:81
- API: http://localhost:8000/docs

Остановить проект:

```bash
docker compose down
```

## Запуск для разработки

Фронтенд:

```bash
npm install
npm run dev:frontend
```

Админка:

```bash
npm install
npm run dev:admin
```

Адреса при dev-запуске:

- фронтенд: http://127.0.0.1:5173
- админка: http://127.0.0.1:5174

Бэкенд отдельно:

```bash
cd apps/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Для отдельного запуска бэкенда нужен Postgres и настроенный `.env`.