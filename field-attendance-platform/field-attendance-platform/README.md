# Location-Based Attendance & Field Activity Tracking Platform (MVP)

Consent-based, session-scoped field attendance: **Login → Punch In (selfie) → Location permission → Tracking → Punch Out**,
with an admin dashboard (summary, live map, users, per-user route, selfie, event timeline).

- **Backend:** Django 5 + DRF + SimpleJWT + Channels (`backend/`)
- **Frontend:** React + TypeScript + Vite + Tailwind (`frontend/`)
- **DB:** PostgreSQL (SQLite fallback for quick local start)

## Run locally

```bash
# optional: Postgres + Redis
docker compose up -d

# backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # then export the vars (or use your own loader); set DB_NAME to use Postgres
python manage.py makemigrations accounts attendance locations tracking
python manage.py migrate
python manage.py createsuperuser   # superusers automatically get role ADMIN
python manage.py runserver         # ASGI via daphne (HTTP + WebSocket on :8000)

# frontend
cd ../frontend
cp .env.example .env
npm install && npm run dev         # http://localhost:5173

# tests
cd ../backend && python manage.py test
```

> Geolocation and camera need a secure context: `localhost` works; any other host needs HTTPS.

## API (all under `/api/`)

| Endpoint | Who | Purpose |
|---|---|---|
| `POST auth/register/` · `auth/login/` · `auth/refresh/` · `GET auth/me/` | public / any | JWT auth (register always creates `USER`) |
| `POST auth/logout/` | authenticated | Blacklists refresh token and ends session |
| `GET auth/health/` | public | Service health check with DB connectivity status |
| `POST attendance/punch-in/` (multipart: selfie, latitude, longitude, accuracy) | user | Creates session + audit events |
| `POST attendance/punch-out/` | user | Closes session, final location if provided |
| `GET attendance/current/` · `history/` | user | Own session/timeline/history |
| `GET attendance/sessions/<id>/selfie/` | owner or admin | Authenticated selfie download |
| `POST locations/` | user | Record a point (active session only) |
| `POST locations/batch/` | user | Flush offline queue with speed sanity checks (<150 km/h) |
| `GET tracking/config/` · `POST tracking/events/` | user | Server-set interval; report LOCATION_UNAVAILABLE / PERMISSION_DENIED |
| `GET admin/summary/` · `live/` · `sessions/` · `sessions/<id>/` | admin | Monitoring & metrics |
| `GET/PATCH admin/users/` | admin | List/search/filter, enable/disable |
| `WS /ws/admin/live/?token=<access>` | admin | Live location/status feed via Channels |

## Background & Management Commands

- **Seed Demo Data:**
  ```bash
  python manage.py seed_demo
  ```
  Creates demo users (`admin`, `alice`, `bob`, `charlie`), demo attendance sessions with routes, field visits, leave requests, and holidays.

- **Auto-Close Stale Sessions:**
  ```bash
  python manage.py close_stale_sessions [--hours 8] [--dry-run]
  ```
  Closes sessions where no location update has been received for more than 8 hours (safe for cron/scheduled jobs).

## Design decisions

- **Server-side authorization:** every admin view uses `IsAdminRole`, which reads the role from the DB. Frontend route guards are UX only.
- **Offline Resilient Tracking:** when offline, points are buffered locally and automatically flushed to `/api/locations/batch/` upon reconnection.
- **Tracking interval is configurable** via `TRACKING_INTERVAL_SECONDS` (served to the client).
- **Interruptions:** the browser reports permission denied / position unavailable → recorded once as `LOCATION_UNAVAILABLE` / `LOCATION_PERMISSION_DENIED`; the next accepted point records `TRACKING_RESUMED`.
- **Server timestamps** are used for live location records; batch submissions include client timestamps bounded by session lifetime.
- **Selfies** are validated (type, size, real image via Pillow) and served only through an authenticated endpoint.
- **Maps** are powered by Leaflet + OSM in `components/MapView.tsx`.
- **Token Blacklisting**: Logout immediately blacklists the JWT refresh token using SimpleJWT blacklist.

## Operational & Next Steps

- Schedule `python manage.py close_stale_sessions` to run every 30-60 minutes in production.
- Geolocation and camera require HTTPS in non-localhost production environments.
- Use PostgreSQL and Redis in production as configured in `docker-compose.yml`.
