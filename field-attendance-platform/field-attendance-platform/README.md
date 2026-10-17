# Location-Based Attendance & Field Activity Tracking Platform

[![Backend Tests](https://img.shields.io/badge/Backend%20Tests-16%2F16%20Passing-brightgreen)](file:///c:/Users/Abhinav/Desktop/Ncode/field-attendance-platform/field-attendance-platform/backend)
[![Frontend Build](https://img.shields.io/badge/Frontend-Vite%20%2B%20TypeScript%20Passing-blue)](file:///c:/Users/Abhinav/Desktop/Ncode/field-attendance-platform/field-attendance-platform/frontend)
[![Design System](https://img.shields.io/badge/Aesthetics-TailwindCSS%20Accessible-indigo)](file:///c:/Users/Abhinav/Desktop/Ncode/field-attendance-platform/field-attendance-platform/frontend)

Consent-based, session-scoped field attendance and real-time monitoring platform:  
**Login → Punch In (selfie) → Location permission → Tracking & Offline Sync → Punch Out**, with an Admin Command Center (summary KPIs, real-time WebSocket map, user search/filter, route playback, evidence photos, event timeline, and CSV export).

---

## Architecture Overview

```text
+-----------------------------------------------------------------------------------+
|                                CLIENT APPLICATIONS                                |
|                                                                                   |
|   Field User Portal (React 18 + PWA)             Admin Command Center (React 18)   |
|   - Punch In with Camera Selfie                  - Real-time Leaflet Map          |
|   - High-precision Geolocation tracking         - Live WebSockets status pins    |
|   - Offline queue (localStorage)                - Route playback & History       |
|   - Field Visit Logs with Evidence Photos       - User management (Enable/Disable)|
+------------------------------------------+----------------------------------------+
                                           |
                               HTTP / WSS  | (JWT Auth + SimpleJWT Blacklist)
                                           v
+-----------------------------------------------------------------------------------+
|                         BACKEND SERVICE (Django 5 + ASGI)                         |
|                                                                                   |
|   Daphne ASGI Server / Channels Protocol Router                                   |
|   ├── REST APIs (Django REST Framework):                                          |
|   │   ├── /api/auth/        (Login, Register, Logout w/ Blacklist, Health)       |
|   │   ├── /api/attendance/  (Punch In, Punch Out, Current, History, Visits)      |
|   │   ├── /api/locations/   (Single & Batch location ingest with speed checks)    |
|   │   └── /api/admin/       (Live overview, Summary cards, Audit events, Users)   |
|   └── WebSockets Consumer (/ws/admin/live/?token=<JWT>):                          |
|       └── Real-time broadcast channel for active session pins & status changes   |
+------------------------------------------+----------------------------------------+
                                           |
                    +----------------------+----------------------+
                    |                                             |
                    v                                             v
     +------------------------------+             +-------------------------------+
     |  PostgreSQL 16 (or SQLite)   |             |            Redis 7            |
     |  - User roles & profiles     |             |  - Channels Layer Broker      |
     |  - Attendance sessions       |             |  - Real-time Pub/Sub groups   |
     |  - Location breadcrumbs      |             +-------------------------------+
     |  - Audit tracking events     |
     +------------------------------+
```

---

## Key Features

1. **Session-Scoped & Consent-Based Tracking:**
   - Tracking **never** occurs outside active duty hours.
   - Requires explicit employee punch-in accompanied by a verified camera selfie.
   - Immediate cessation upon punch-out.
2. **Offline Resilience & Batch Ingest:**
   - Geolocation breadcrumbs continue recording during network outages.
   - Buffered locally in `localStorage` and synchronized via `/api/locations/batch/` with velocity checks (`< 150 km/h`).
3. **Audited Transparency:**
   - Browser permission denials or GPS outages trigger `LOCATION_UNAVAILABLE` audit events.
   - Regained GPS triggers `TRACKING_RESUMED`, visible on the employee's timeline and admin map.
4. **Hardened Security:**
   - Role enforcement validated strictly on the backend (`IsAdminRole`).
   - Selfies and evidence photos served through authenticated streaming views.
   - Logout blacklists the JWT refresh token on the server.
5. **Background Session Auto-Closer:**
   - Includes `python manage.py close_stale_sessions` to automatically close abandoned shifts after 8 hours of inactivity.

---

## Quick Start (Run Locally)

### 1. Start Services (Postgres + Redis)
```bash
docker compose up -d
```

### 2. Backend Setup
```bash
cd backend

# Create and activate virtual environment
python -m venv .venv
# Windows:
.\.venv\Scripts\activate
# Linux/macOS:
# source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run migrations
python manage.py migrate

# Seed complete demo data (Admin + 5 Field Officers with routes & visits)
python manage.py seed_demo

# Run Daphne ASGI server (HTTP + WebSockets on port 8000)
python manage.py runserver
```

### 3. Frontend Setup
```bash
cd ../frontend

# Install dependencies
npm install

# Start Vite dev server (runs on http://localhost:5173)
npm run dev
```

### 4. Run Automated Test Suite
```bash
cd backend
python manage.py test
```
*(All 15 test suites verify role permissions, privacy isolation, batch location speed checks, stale session closing, and token blacklisting).*

---

## Seed Accounts (Quick Demo)

| Role | Username | Password | Notes |
|---|---|---|---|
| **Administrator** | `admin` | `Admin@12345` | Full access to Admin Command Center, live map, user controls |
| **Field Officer** | `arjun` | `Demo@12345` | Active field session with realistic route in Surat, India |
| **Field Officer** | `priya` | `Demo@12345` | Field officer with completed past shift sessions |
| **Field Officer** | `ravi` | `Demo@12345` | Field officer with field visit notes and evidence |

---

## Environment Variables

### Backend (`backend/.env`)
| Variable | Default | Description |
|---|---|---|
| `SECRET_KEY` | `dev-insecure-...` | Django secret key (must be set in production) |
| `DEBUG` | `True` | Set to `False` in production |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1` | Comma-separated list of valid host headers |
| `DB_NAME` | `field_attendance` | PostgreSQL database name (falls back to SQLite if omitted) |
| `DB_USER` | `postgres` | PostgreSQL username |
| `DB_PASSWORD` | `postgres` | PostgreSQL password |
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `REDIS_URL` | `redis://localhost:6379/1` | Redis URL for Channels layer |
| `TRACKING_INTERVAL_SECONDS` | `30` | Configurable interval for periodic location updates |

### Frontend (`frontend/.env`)
| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | `/api` | Base URL for backend REST API |
| `VITE_WS_URL` | `ws://localhost:8000` | Base URL for WebSockets (use `wss://` in production) |
| `VITE_MAP_API_KEY` | *(empty)* | Optional API key for MapTiler or Stadia Maps vector tiles |
| `VITE_MAP_STYLE` | *(empty)* | Optional style preset (`streets-v2`, `dataviz`, `alidade-smooth`, or custom JSON URL) |

#### Map Provider Terms & Free-Tier Limits
- **MapTiler Cloud**: Free tier allows up to **100,000 requests/month** with vector tile rendering and 3D buildings. Requires sign-up at [maptiler.com](https://www.maptiler.com).
- **Stadia Maps**: Free tier provides up to **200,000 map views/month** for development and non-commercial usage. Requires sign-up at [stadiamaps.com](https://stadiamaps.com).
- **OpenStreetMap Raster Fallback**: When `VITE_MAP_API_KEY` is not provided, the platform automatically falls back to standard OpenStreetMap raster tiles with `referrerPolicy: 'origin'`, full attribution compliance, and zero watermark overlays. A non-intrusive demo badge reminds administrators to configure an API key for production vector rendering.

---

## API Reference (All endpoints under `/api/`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `auth/register/` | Public | Employee registration (always assigned `USER` role) |
| `POST` | `auth/login/` | Public | Returns JWT access & refresh tokens |
| `POST` | `auth/refresh/` | Public | Refreshes expired access token |
| `POST` | `auth/logout/` | Authenticated | Blacklists refresh token |
| `GET` | `auth/health/` | Public | Service health & database connectivity check |
| `GET` | `attendance/consent/` | User | Check user tracking policy consent status |
| `POST` | `attendance/consent/` | User | Record consent for current policy version |
| `POST` | `attendance/punch-in/` | User | Starts shift (multipart: selfie + GPS coords + consent verification) |
| `POST` | `attendance/punch-out/` | User | Concludes shift, sets tracking to PUNCHED_OUT |
| `GET` | `attendance/current/` | User | Active shift session and current tracking state |
| `GET` | `attendance/history/` | User | Historical attendance records & duration summaries |
| `GET` | `attendance/sessions/<id>/selfie/` | Owner / Admin | Authenticated selfie download |
| `POST` | `attendance/visits/` | User | Log field client visit with location & evidence |
| `POST` | `locations/` | User | Submit real-time location coordinate |
| `POST` | `locations/batch/` | User | Flush offline breadcrumbs (with speed sanity checks) |
| `GET` | `tracking/config/` | User | Client sync for tracking interval |
| `POST` | `tracking/events/` | User | Log audit event (permission denied, GPS unavailable) |
| `GET` | `admin/summary/` | Admin | KPI cards (active users, total hours, present count) |
| `GET` | `admin/live/` | Admin | Real-time map pins for all active field staff |
| `GET` | `admin/sessions/` | Admin | Filterable session records with CSV export |
| `GET` | `admin/sessions/<id>/` | Admin | Detailed route breadcrumbs and event audit timeline |
| `GET/PATCH` | `admin/users/` | Admin | Employee roster search, filter, enable/disable toggle |
| `WS` | `/ws/admin/live/?token=<jwt>`| Admin | Live location & status stream |

---

## Development Environment & Secure Context

- **Local Development over HTTP:** The Vite dev server runs at `http://localhost:5173`. According to W3C and Chromium standards, `http://localhost` is treated as a **Secure Context**, enabling camera `getUserMedia`, `navigator.geolocation`, and the `Screen Wake Lock API` to function out of the box without certificate bypass warnings.
- **SSL Certificates:** Any custom self-signed SSL plugin (`basicSsl`) has been removed from `vite.config.ts` to prevent untrusted certificate errors that break media permissions. If HTTPS is needed in staging, configure valid trusted certificates via `mkcert` or Let's Encrypt.
- **Environment Schemas:** `VITE_API_URL` defaults to `/api` (proxied to backend) and `VITE_WS_URL` defaults to `ws://localhost:8000`.

---

## Documentation Links

- **[Privacy & Data Protection Policy](docs/PRIVACY.md)**: Full details on data minimization, user rights, retention, and consent mechanisms.
- **[Technical Limitations & Mobile Roadmap](docs/LIMITATIONS.md)**: Details on browser tab throttling, OS power management, and the native mobile app architecture.
