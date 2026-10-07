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
| `POST attendance/punch-in/` (multipart: selfie, latitude, longitude, accuracy) | user | Creates session + audit events |
| `POST attendance/punch-out/` | user | Closes session, final location if provided |
| `GET attendance/current/` · `history/` | user | Own session/timeline/history |
| `GET attendance/sessions/<id>/selfie/` | owner or admin | Authenticated selfie download |
| `POST locations/` | user | Record a point (active session only) |
| `GET tracking/config/` · `POST tracking/events/` | user | Server-set interval; report LOCATION_UNAVAILABLE / PERMISSION_DENIED |
| `GET admin/summary/` · `live/` · `sessions/` · `sessions/<id>/` | admin | Monitoring |
| `GET/PATCH admin/users/` | admin | List/search/filter, enable/disable |
| `WS /ws/admin/live/?token=<access>` | admin | Live location/status feed |

## Design decisions

- **Server-side authorization:** every admin view uses `IsAdminRole`, which reads the role from the DB. Frontend route guards are UX only.
- **Tracking interval is configurable** via `TRACKING_INTERVAL_SECONDS` (served to the client).
- **Interruptions:** the browser reports permission denied / position unavailable → recorded once as `LOCATION_UNAVAILABLE` / `LOCATION_PERMISSION_DENIED`; the next accepted point records `TRACKING_RESUMED`. Nothing tries to bypass privacy controls.
- **Server timestamps** are used for location records (client clocks aren't trusted).
- **Selfies** are validated (type, size, real image via Pillow) and served only through an authenticated endpoint. Use S3/R2/Cloudinary storage in production.
- **Maps** are behind `components/MapView.tsx` (Leaflet + OSM now; swap for Mapbox/Google in that one file).
- `LOCATION_UPDATED` is defined but not logged per point (would flood the audit table); points live in `LocationRecord`.
- Data model is simplified: selfie and punch times live on `AttendanceSession` (no separate `PunchRecord`/`Selfie` tables yet).

## Known limits / next steps

- Web tracking stops when the tab is suspended or the browser is closed — expected; native apps fix this (Phase 10). The UI tells users to keep the page open.
- No offline queue yet (failed posts show OFFLINE; points during outages are lost).
- Add before production: retention/cleanup job for location data, privacy-policy page, WebSocket token via short-lived ticket instead of query string, signed-URL selfie delivery from object storage, Sentry/logging, CI, deployment config.
- Not yet run end-to-end in this environment (no package install available) — run the tests and `npm run build` first.
