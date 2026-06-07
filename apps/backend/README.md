# Backend

FastAPI gateway for the Ujin Platform API.

## Run

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

## Endpoints

- `GET /health`
- `GET /api/lobby/overview?token=...`
- `POST /api/emergency/activate`
- `POST /api/emergency/deactivate`
- `GET /api/emergency/state`
