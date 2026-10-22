# Field Officer Mobile App (Expo / React Native / TypeScript)

Welcome to the **Field Officer (Employee)** mobile application for the Field Attendance & Activity Management Platform. Built with **Expo SDK 58**, **React Native 0.88**, **TypeScript (Strict)**, and **Expo Router (File-based Tabs Navigation)**.

---

## 📱 Table of Contents
1. [Architecture & Features](#-architecture--features)
2. [Project Structure](#-project-structure)
3. [Prerequisites](#-prerequisites)
4. [Step-by-Step Setup Guide](#-step-by-step-setup-guide)
   - [Step 1: Backend LAN Configuration](#step-1-backend-lan-configuration)
   - [Step 2: Mobile Environment Configuration (.env)](#step-2-mobile-environment-configuration-env)
   - [Step 3: Install Dependencies](#step-3-install-dependencies)
   - [Step 4: Launch Expo Development Server](#step-4-launch-expo-development-server)
   - [Step 5: Testing with Expo Go (Android / iOS)](#step-5-testing-with-expo-go-android--ios)
5. [Troubleshooting & Common Errors](#-troubleshooting--common-errors)
   - [Network Request Failed](#1-network-request-failed)
   - [Localhost Misuse](#2-localhost-misuse)
   - [Windows Firewall Rule](#3-windows-firewall-rule)
   - [Permissions Denied](#4-permissions-denied)
   - [Cloudflare / Tunnel Fallback](#5-tunnel-fallback)
6. [Background Tracking & Development Builds](#-background-tracking--development-builds)
   - [Why Expo Go Cannot Run Background Tracking](#why-expo-go-cannot-run-background-tracking)
   - [Building a Custom Development Client](#building-a-custom-development-client)
   - [Enabling the Background Tracking Flag](#enabling-the-background-tracking-flag)
7. [Testing & Quality Assurance](#-testing--quality-assurance)

---

## 🏗 Architecture & Features

### 1. Authentication & Security
- **Secure Token Storage**: JWT Access & Refresh tokens stored exclusively in hardware-backed `expo-secure-store` (falls back to memory on web).
- **Auto-Refresh with Mutex Queue**: Intercepts 401 Unauthorized responses with a single in-flight refresh mutex, resolving queued requests transparently.
- **Graceful Logout**: Invalidated or expired refresh tokens automatically clear SecureStore and route to the login screen.
- **Transparent Build Info**: Visible `API: <url>` on login screen in dev builds for instant debugging.

### 2. Attendance & Punch-In Lifecycle
- **Pre-Shift Verification Checklist**:
  1. *Tracking Consent*: Acceptance tracked via `/api/attendance/consent/` with policy versioning and local storage fallback.
  2. *GPS Position Fix*: Real-time permission checking (`granted`, `denied`, `services off`) with direct link to OS Settings.
  3. *Selfie Verification*: Live front camera capture with square crop, auto-compressed to `<=1280px` JPEG `~0.8` via `expo-image-manipulator`, with gallery selection fallback.
  4. *Checklist Enforcement*: **PUNCH IN** button remains disabled until all 3 criteria are strictly satisfied.
- **Active Duty Mode**:
  - Live ticking timer (`HH:MM:SS`) tracking shift elapsed time.
  - Active keep-awake via `expo-keep-awake` preventing screen sleep while on duty.
  - Live GPS accuracy, relative last-fix timestamp (`Just now`, `X ago`), and interruption counter.
  - Prominent transparency disclosure: *"Your location is shared with your administrator while you are punched in"*.
  - **PUNCH OUT** with confirmation dialog, final GPS capture, and automatic tracking shutdown.

### 3. Resilient Location Tracking & Offline Queue
- **Foreground Tracking**: Continuous location fixes throttled to `/api/tracking/config/` interval.
- **Interruption Deduplication**: Monitors `AppState`, location service availability (`hasServicesEnabledAsync`), and network drops (`NetInfo`). Emits deduplicated `LOCATION_UNAVAILABLE` or `LOCATION_PERMISSION_DENIED` events to `/api/tracking/events/`. Resumes automatically on next accepted point (`TRACKING_RESUMED`).
- **Offline SQLite Queue**: Failed points during signal drops or airplane mode are persisted locally in SQLite (`expo-sqlite`) with client timestamps.
- **Batch Synchronization**: When connectivity resumes, queued points are flushed sequentially via `POST /api/locations/batch/` with speed (`<150 km/h`) and timestamp validation.

### 4. Tab Navigation & Self-Service Profile Hub
- **Attendance**: Core duty status, checklist, and live tracking.
- **Field Visits**: Searchable placeholder empty state for client visits.
- **History**: Full session timeline with punch-in/out times, duration calculations, and pull-to-refresh.
- **Profile Hub**: Officer badge (Arjun Mehta, Field Officer), quick tiles (*View Attendance*, *Holiday List*, *Notes*, *Announcements*), Change Password modal (`/api/me/change-password/`), and Multilingual support (English, Hindi, Gujarati via `i18next`).
- **Top Status Chip**: Animated header badge reflecting `Off duty` / `On duty` (pulsing emerald dot) / `Location lost` (amber) / `Offline` (gray).

---

## 📂 Project Structure

```
mobile/
├── app/
│   ├── (tabs)/
│   │   ├── _layout.tsx       # Bottom tabs navigation with top status chip
│   │   ├── index.tsx         # Attendance Screen (Core Checklist & Active Duty)
│   │   ├── visits.tsx        # Field Visits Placeholder
│   │   ├── history.tsx       # Past Sessions Timeline with Pull-to-Refresh
│   │   └── profile.tsx       # Officer Self-Service Hub & Modals
│   ├── _layout.tsx           # Root navigation stack with Auth & Tracking Providers
│   ├── login.tsx             # Login Screen with API URL indicator & show/hide toggle
│   └── modal.tsx             # Info modal
├── src/
│   ├── components/
│   │   └── StatusChip.tsx    # Pulsing duty status chip
│   ├── config/
│   │   └── env.ts            # Environment loader (.env & EXPO_PUBLIC_*)
│   ├── context/
│   │   ├── AuthContext.tsx   # User profile, tokens, login & logout
│   │   └── TrackingContext.tsx # Live shift state, timer, and GPS watchers
│   ├── i18n/
│   │   └── index.ts          # English, Hindi, and Gujarati translations
│   ├── services/
│   │   ├── api.ts            # Axios client with auto-refresh & token interceptor
│   │   ├── storage.ts        # SecureStore credentials wrapper
│   │   ├── trackingManager.ts # Foreground location engine & interruption detector
│   │   ├── offlineQueue.ts   # Native SQLite offline queue
│   │   └── offlineQueue.web.ts # Web localStorage fallback
│   └── types/
│       └── index.ts          # Strict TypeScript interfaces
├── __tests__/
│   ├── api.test.ts           # Token refresh mutex & error parsing tests
│   ├── offlineQueue.test.ts  # Batch synchronization & FIFO queue tests
│   └── trackingStateMachine.test.ts # Transition tests (OFF_DUTY -> ON_DUTY -> LOST)
├── .env.example
├── app.json
├── metro.config.js
├── package.json
└── tsconfig.json
```

---

## ⚙ Prerequisites

1. **Node.js**: v18+ or v20+ LTS.
2. **Python**: Python 3.10+ with Django environment installed.
3. **Expo Go App**: Installed on physical Android or iOS device from Google Play Store or Apple App Store.
4. **Physical Device & Host PC on the Same Wi-Fi Network**.

---

## 🚀 Step-by-Step Setup Guide

### Step 1: Backend LAN Configuration

The mobile device running Expo Go needs to reach your host computer's IP address.

1. Find your computer's local Wi-Fi IP address:
   ```powershell
   ipconfig
   # Look for "IPv4 Address", e.g. 192.168.20.64
   ```

2. Start the Django backend bound to `0.0.0.0`:
   ```powershell
   cd field-attendance-platform\field-attendance-platform\backend
   python manage.py runserver 0.0.0.0:8000
   ```
   *(Or using ASGI/Daphne: `daphne -b 0.0.0.0 -p 8000 field_attendance.asgi:application`)*

3. Verify `ALLOWED_HOSTS` in `field_attendance/settings.py` includes your IP or wildcard:
   ```python
   ALLOWED_HOSTS = ['*']  # Or ['localhost', '127.0.0.1', '192.168.20.64']
   ```

### Step 2: Mobile Environment Configuration (.env)

In the `mobile/` directory, create a `.env` file based on `.env.example`:

```bash
cd mobile
cp .env.example .env
```

Edit `mobile/.env` and insert your host PC's Wi-Fi IP:
```ini
EXPO_PUBLIC_API_URL=http://192.168.20.64:8000/api
EXPO_PUBLIC_FEATURE_BACKGROUND_TRACKING=false
```

> **Note**: Do not use `localhost` or `127.0.0.1` because on a mobile device, `localhost` refers to the mobile phone itself, not your PC!

### Step 3: Install Dependencies

```powershell
cd mobile
npm install
```

### Step 4: Launch Expo Development Server

```powershell
npx expo start
```

To clear Metro cache if needed:
```powershell
npx expo start -c
```

### Step 5: Testing with Expo Go (Android / iOS)

1. Open the **Expo Go** app on your phone.
2. **Android**: Tap **Scan QR code** and scan the QR code displayed in the terminal.
3. **iOS**: Open the native **Camera** app, point at the terminal QR code, and tap the Expo Go banner.
4. Login with standard demo credentials:
   - **Username**: `arjun`
   - **Password**: `Demo@12345`

---

## 🛠 Troubleshooting & Common Errors

### 1. `Network request failed`
- **Cause**: The phone cannot reach port `8000` on the PC.
- **Fix**:
  1. Test phone connectivity by opening `http://<YOUR_PC_IP>:8000/api/` in your phone's mobile browser.
  2. If it times out, your Windows Firewall is blocking incoming connections. See [Windows Firewall Rule](#3-windows-firewall-rule).
  3. Ensure both phone and PC are connected to the exact same Wi-Fi SSID (not Guest Wi-Fi with client isolation).

### 2. `Localhost Misuse`
- **Error**: API requests fail with `ERR_CONNECTION_REFUSED` or `Failed to connect to localhost/127.0.0.1`.
- **Fix**: Update `mobile/.env` with your actual LAN IPv4 address (e.g. `http://192.168.X.X:8000/api`). Verify the login screen footer displays `API: http://192.168.X.X:8000/api`.

### 3. Windows Firewall Rule
To allow inbound traffic to Django port 8000 from your phone:
```powershell
# Run PowerShell as Administrator:
New-NetFirewallRule -DisplayName "Django DRF Port 8000" -Direction Inbound -LocalPort 8000 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "Expo Metro Port 8081" -Direction Inbound -LocalPort 8081 -Protocol TCP -Action Allow
```

### 4. Permissions Denied
- If Camera or Location access is denied, tap the **Open Settings** button in the app alert to jump directly to the app permissions settings screen in iOS or Android.

### 5. Tunnel Fallback
If you are on a restricted corporate Wi-Fi or mobile hotspot that blocks local LAN connections, start Expo with tunnel mode:
```powershell
npx expo start --tunnel
```
*(Requires `@expo/ngrok` which is downloaded automatically).*

---

## 🛰 Background Tracking & Development Builds

### Why Expo Go Cannot Run Background Tracking
- **Expo Go Limitation**: Expo Go is a sandboxed pre-built environment. It **does not support native background tasks** (`expo-task-manager` / `Location.startLocationUpdatesAsync`) or persistent Android foreground service notifications with custom channels.
- When `EXPO_PUBLIC_FEATURE_BACKGROUND_TRACKING=false` (default), the app uses pure foreground tracking (`Location.watchPositionAsync`), which runs seamlessly inside Expo Go and web browsers.

### Building a Custom Development Client
To enable native background location tracking while the phone screen is off or app is minimized:

1. **Install EAS CLI**:
   ```bash
   npm install -g eas-cli
   eas login
   ```

2. **Configure Build Profile** (`eas.json`):
   ```json
   {
     "build": {
       "development": {
         "developmentClient": true,
         "distribution": "internal"
       }
     }
   }
   ```

3. **Build the APK / App Bundle**:
   - Cloud Build (Android APK):
     ```bash
     eas build --profile development --platform android
     ```
   - Local Native Build:
     ```bash
     npx expo run:android
     ```

### Enabling the Background Tracking Flag
Once running inside your development client, edit `.env`:
```ini
EXPO_PUBLIC_FEATURE_BACKGROUND_TRACKING=true
```
The app will automatically:
1. First request standard foreground location permissions (*While Using the App*).
2. Display a transparent explanation dialog informing the officer why background tracking is required.
3. Request `Location.requestBackgroundPermissionsAsync()` (*Allow All the Time*).
4. Launch a persistent Android foreground notification: *"Location tracking active for duty session"*.

---

## 🧪 Testing & Quality Assurance

### Run Unit Tests
A comprehensive Jest test suite verifies the critical logic:
- `api.test.ts`: Refresh token mutex queue, single in-flight refresh, auto-logout on failure.
- `trackingStateMachine.test.ts`: Status transitions (`OFF_DUTY`, `ON_DUTY`, `LOCATION_LOST`, `OFFLINE`).
- `offlineQueue.test.ts`: SQLite FIFO point persistence, chronological flushing, and batch submissions.

```bash
npm test
```
*Result: 3/3 suites passed, 13/13 tests passed.*

### TypeScript Strict Verification
```bash
npx tsc --noEmit
```
*Result: 0 errors.*

### ESLint Check
```bash
npm run lint
```
*Result: 0 errors.*
