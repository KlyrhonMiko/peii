# Backend

FastAPI backend scaffold for `peii`.

## Run locally

1. Install dependencies:

```bash
pip install -r requirements.txt
```

2. Start the development server from `backend/`:

```bash
uvicorn main:app --reload
```

The backend loads the root `.env` automatically.

Database mode is controlled from the root `.env`:

- `DB_MODE=local` uses `LOCAL_DATABASE_URL`
- `DB_MODE=supabase` uses `SUPABASE_DATABASE_URL`
- `SQL_ECHO=false` keeps SQLAlchemy query logs off for normal development output

## Database migrations

Run migrations from `backend/`:

```bash
alembic upgrade head
```

Create a new migration after model changes:

```bash
alembic revision --autogenerate -m "describe change"
```

## Validation

Run these from `backend/`:

```bash
pytest
ruff check .
mypy .
```

## Run with Docker

From the repo root:

```bash
docker compose up --build
```

The bundled PostgreSQL and Adminer services are for `DB_MODE=local`.
If you switch to `DB_MODE=supabase`, the backend will use the Supabase connection string from `.env`.

For local database containers only:

```bash
docker compose up postgres adminer
```

Services:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`
- Adminer: `http://localhost:8080`
- PostgreSQL: `localhost:5432`

## Initial structure

- `core/`: app settings, database engine/session, and other shared infrastructure.
- `core/deps.py`: shared FastAPI dependencies and common query params.
- `core/handlers.py`: global API exception handling.
- `core/base.py`: shared SQLModel base with UUIDv7 primary key and audit/soft-delete fields.
- `models/`: SQLModel table definitions.
- `schemas/`: request and response schemas for FastAPI.
- `routers/`: API endpoint modules.
- `services/`: business-logic layer.
- `utils/`: project-specific helpers.
