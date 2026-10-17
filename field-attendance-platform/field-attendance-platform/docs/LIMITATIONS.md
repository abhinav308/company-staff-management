# Technical Limitations & Mobile Roadmap

**Platform:** Location-Based Attendance & Field Activity Tracking Platform  
**Target:** Web Application (Phase 1-9) → Native Mobile Expansion (Phase 10)  

---

## 1. Web Browser Tracking Limitations

Modern web browsers (Chrome, Safari, Firefox, Edge) operate under stringent sandboxing and battery optimization rules enforced by underlying operating systems (Android, iOS, Windows, macOS). While the web application provides zero-install, universal cross-platform access, administrators and users should be aware of the following web-specific characteristics:

### A. Background Tab Throttling & Suspension
- **Behavior:** When a user switches to another browser tab, minimizes the browser, or locks the phone screen, mobile operating systems drastically reduce JavaScript CPU execution and timer frequency (throttling `setInterval` to once per minute or pausing execution entirely).
- **Impact:** Periodic GPS updates will pause while the browser is completely in the background on mobile devices.
- **Platform Mitigation:**
  - The UI clearly reminds field staff to **keep the web app active/open in the foreground** during duty hours.
  - The offline location buffer (`fap_offline_pts`) queues points locally and flushes them in a batch upon tab focus and network availability.
  - Interruption audit events (`LOCATION_UNAVAILABLE` and `TRACKING_RESUMED`) ensure admin clarity without false attendance accusations.

### B. OS Screen Sleep & Power Management
- **Behavior:** Aggressive battery savers (e.g. Samsung OneUI, Xiaomi MIUI, Huawei EMUI) suspend web browser network sockets when the screen is powered down.
- **Impact:** WebSocket live pins might show as inactive if the phone display is turned off for extended intervals.

### C. Camera & Geolocation Permissions
- **Behavior:** Web browsers cannot bypass device location service switches or camera permission dialogs.
- **Impact:** If an employee disables GPS via system settings, the web app detects the state and marks `LOCATION_UNAVAILABLE` or `PERMISSION_DENIED`, automatically alerting the administrator and preventing fabricated routes.

---

## 2. Roadmap: Native Mobile Application (Android & iOS)

To support **continuous 24/7 background geofencing and continuous breadcrumb tracking with the phone screen locked**, the architecture has been intentionally designed to power native Android and iOS mobile applications without changing any backend endpoints.

### Unified Backend Architecture
The existing backend endpoints are 100% reusable by native mobile clients:
1. `POST /api/auth/login/` & `POST /api/auth/refresh/` - Standard OAuth2 / JWT authentication.
2. `POST /api/attendance/punch-in/` - Native camera multipart upload with high-precision GPS.
3. `POST /api/locations/batch/` - Periodic native background flush of queued SQLite coordinates.
4. `GET /api/tracking/config/` - Dynamic tracking frequency set centrally by administrators.
5. `POST /api/attendance/punch-out/` - Finalizes shift and disables OS background location services.

### Proposed Native Stack
- **Framework:** React Native with Expo (or pure Kotlin for Android / Swift for iOS).
- **Background Geolocation Library:** `react-native-background-geolocation` or Android Foreground Service (`startForegroundService` with notification).
- **Local Persistence:** SQLite / WatermelonDB for offline point buffering during zero-connectivity zones in remote field areas.
- **Geofencing:** Native OS geofencing APIs (`GeofenceClient` on Android, `CLCircularRegion` on iOS) to automatically alert staff when entering client site perimeters.

---

## 3. Comparison Matrix: Web vs. Native

| Feature | Current Web App (PWA) | Native Mobile App |
|---|---|---|
| **Zero Installation / Instant Access** | Yes (Open URL in any browser) | Requires APK / App Store install |
| **Punch-In Selfie Verification** | Yes (via HTML5 MediaDevices / Camera API) | Yes (via Camera hardware API) |
| **Foreground GPS Tracking** | Yes (via HTML5 Geolocation API) | Yes |
| **Continuous Background Tracking (Screen Off)** | Limited by OS browser suspension | Yes (via Android Foreground Service / iOS Significant Change) |
| **Offline Breadcrumb Queue** | Yes (`localStorage` + `/locations/batch/`) | Yes (SQLite + `/locations/batch/`) |
| **Battery Consumption** | Low | Managed via native motion-activity detection (accelerometer) |
| **Admin Real-time Live Map** | Yes (Live WebSocket feed) | Yes (Live WebSocket feed) |
