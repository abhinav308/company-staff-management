# Privacy & Data Protection Policy

**Platform:** Location-Based Attendance & Field Activity Tracking Platform  
**Organization:** Ncode Solutions IT Division (GNFC)  
**Last Updated:** October 2026  

---

## 1. Overview & Purpose
This platform is designed to provide transparent, accountable, and consent-based attendance verification and activity logging for field employees during active duty. 

Our core architectural principle is:  
> **Session-Scoped, Visible, and Consent-Based.**  
> Tracking only begins when an employee explicitly punches in with a selfie, and stops immediately and completely upon punch-out.

---

## 2. What Information is Collected?

| Data Point | When Collected | Purpose | Access Level |
|---|---|---|---|
| **Selfie Verification Photo** | At Punch-In | Visual verification of the employee's physical presence at start of shift. | User (Self) & Authorized Administrators |
| **GPS Coordinates (Latitude, Longitude)** | Periodically during an **active** session | Mapping field route and duty activity. | User (Self) & Authorized Administrators |
| **GPS Accuracy Metric** | Accompanies each GPS coordinate | Ensuring reliability and filtering inaccurate satellite/tower readings. | System & Admin Audit |
| **Audit Events (e.g. Permission Changes)** | When browser reports location unavailability or permission revoked | Transparent recording of operational disruptions and reconnects. | User Timeline & Admin Audit |
| **Field Visit Notes & Evidence Photos** | When employee logs a client/site visit | Documenting business meetings and client milestones. | User & Admin Portal |

---

## 3. What is NEVER Collected?

1. **No Background Tracking Outside Sessions:** Tracking occurs **only** between an explicit Punch-In and Punch-Out. No location data is ever accessed when you are punched out or logged out.
2. **No Stealth or Covert Surveillance:** The web application displays an unambiguous, permanent status banner whenever tracking is active.
3. **No Private Device Browsing or Personal Files:** The platform only accesses the device camera (when explicitly initiated by the user for a selfie/evidence photo) and geolocation.

---

## 4. Consent and Employee Control

- **Explicit Consent:** Every punch-in requires employee consent and device permission.
- **Immediate Termination:** Clicking **Punch Out** immediately terminates all geolocation listeners and background intervals.
- **Offline Transparency:** If you lose network connection, points are buffered locally on your device storage (`localStorage`) and sent as a transparent batch once connection is restored.
- **Right to Inspection:** Employees have direct access to their own attendance history, logged timestamps, and route milestones through the User Dashboard (`/attendance/history/`).

---

## 5. Security & Access Control

- **Role-Based Authorization:** Access is strictly partitioned between `USER` and `ADMIN` roles. Role authorization is validated on the backend database for every single API request.
- **Media Protection:** Selfies and visit evidence photos are served through authenticated streaming views that verify JWT bearer tokens and ownership before sending file bytes.
- **Encrypted Transmission:** All network traffic between client browsers and server endpoints uses HTTPS and WSS (WebSockets over TLS).
- **Token Blacklisting:** Logging out immediately blacklists the JWT refresh token on the server so it cannot be reused.

---

## 6. Data Retention & Archival

- **Location Breadcrumbs:** High-frequency location points are retained for 90 days for operational audit and mileage calculation, after which coordinates are purged or rolled up into daily distance summaries.
- **Attendance Records:** Punch times, daily attendance summaries, and approved leave records are maintained as part of statutory employment compliance.
- **Automated Stale Session Termination:** If an active session stops transmitting location updates for over 8 hours, it is automatically marked closed by the server cleanup task.
