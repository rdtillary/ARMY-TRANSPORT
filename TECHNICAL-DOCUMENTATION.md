# AI-Based Transport & Road Space Management System (MT Park)
### Technical Project Documentation

**Institution:** Military College of Telecommunication Engineering (MCTE), Mhow
**Project type:** Web application with Android packaging (PWA / Capacitor)
**Live deployment:** `https://mctetransportsys.onrender.com`
**Source control:** GitHub → continuous deployment to Render

---

## 1. Abstract

The system digitalises vehicle movement control at an **MT (Motor Transport)
Park** — the secured parking area from which military vehicles depart and to
which they return. It provides three role-based terminals:

1. **Admin terminal (Central Control Room)** — a live map of every moving
   vehicle, an ANPR-style gate camera feed, automatic IN/OUT vehicle
   registers, contingency alarms, command broadcasts, personnel & fleet
   administration, and a complete trip archive.
2. **JCO terminal (Monitoring)** — read/monitor view of the live map, fleet
   entries, vehicle status (fuel/maintenance), gate scans and shared
   contingency alarms, with escalation and reporting.
3. **Driver terminal (Android phone)** — after selecting the vehicle number
   and pressing a large START button, the phone transmits GPS positions every
   few seconds; STOP ends the trip. A persistent SOS button raises an
   emergency. A separate terminal exists for each role.

A rule engine continuously cross-checks **gate scans** (camera) against
**tracking state** (driver GPS) and automatically raises alarms for the four
defined contingencies, including timed auto-actions (5-minute, 1-minute and
2-minute rules).

---

## 2. System architecture (high level)

```
 ┌──────────────────────────┐   ┌──────────────────────────┐   ┌──────────────────────────┐
 │  DRIVER TERMINAL (phone) │   │  JCO TERMINAL (monitor)  │   │  ADMIN TERMINAL (control)│
 │  GPS · START/STOP · SOS  │   │  live map · entries      │   │  map · gate · archive    │
 └───────────┬──────────────┘   └────────────┬─────────────┘   └────────────┬─────────────┘
             │ HTTPS (JSON REST)            │ polling 4-6 s                 │
             ▼                               ▼                               ▼
 ┌──────────────────────────────────────────────────────────────────────────────────────┐
 │                    NEXT.JS APPLICATION SERVER  (App Router, Route Handlers)           │
 │   Authentication · Trips · GPS ingestion · Gate/ANPR · Rule engine · Reports          │
 └───────────────────────────────────────┬──────────────────────────────────────────────┘
                                          │ SQL (Drizzle ORM, connection pool)
                                          ▼
 ┌──────────────────────────────────────────────────────────────────────────────────────┐
 │                              POSTGRESQL DATABASE                                       │
 │  users · vehicles · trips · positions · gate_events · incidents · notifications …    │
 └──────────────────────────────────────────────────────────────────────────────────────┘

 Gate camera (future hardware)  ──POST photo+plate──▶ /api/gate/scan
 (today: simulated captures & ANPR readings with demo photographs)
```

**Design characteristics**
- **Thin clients, one server of truth.** Browsers/APKs contain UI only; all
  state lives in PostgreSQL. Any terminal shows the same live picture.
- **Polling (near-real-time)** rather than WebSockets: clients poll every
  4–8 s. This is simple, firewall/HTTPS friendly, and sufficient for vehicle
  tracking at convoy speed.
- **Deterministic rule engine** evaluated on every dashboard refresh, so
  timers and contingencies advance even without a separate background worker.
- **Map abstraction:** renders Google Maps when an API key is configured,
  otherwise OpenStreetMap via Leaflet — the UI code is identical.

---

## 3. Technology stack and why it was chosen

| Layer | Technology | Purpose / justification |
|---|---|---|
| Language | **TypeScript** | Type safety across client & server, fewer runtime bugs |
| UI framework | **Next.js 16 (App Router)** + **React 19** | One project serves pages (SSR/CSR) and a REST API; easy cloud deployment |
| Styling | **Tailwind CSS v4** | Utility-first CSS for a consistent dark military theme without a design team |
| Icons | **lucide-react** | Lightweight SVG icon set |
| Database | **PostgreSQL** | Free, reliable relational store; provided by Render in production |
| ORM | **Drizzle ORM** | Type-safe SQL query builder with migrations (`drizzle-kit push`) |
| Maps | **Leaflet + OpenStreetMap**, optional **Google Maps JS API** | Free-by-default mapping with one-key switch to Google Maps |
| Mobile | **Capacitor 8** + `@capacitor/geolocation` | Wraps the web app into an installable Android APK with native GPS permission |
| Offline/PWA | Web App **manifest** + **service worker** | "Add to Home Screen", offline fallback page, app-like launch |
| Image processing | **sharp** (Node) | Generates launcher/PWA icons from the insignia at every density |
| Source control | **Git / GitHub** | Version history; stores the complete project |
| CI / APK build | **GitHub Actions** | Cloud-compiles the Android APK (no Android Studio needed) |
| Hosting | **Render** (Web Service + PostgreSQL) | Free HTTPS hosting + managed database, auto-deploy on push |
| Runtime | **Node.js 20** | Executes the Next.js server |

---

## 4. Frontend design

### 4.1 Pages (App Router, files under `src/app/`)

| Route | File | Role |
|---|---|---|
| `/` | `page.tsx` | Login / terminal chooser (Admin, JCO, Driver cards) |
| `/officer` | `officer/page.tsx` | **Admin** — Central Control Room (three tabs) |
| `/jco` | `jco/page.tsx` | **JCO** monitoring dashboard |
| `/driver` | `driver/page.tsx` | **Driver** phone UI (vehicle select / START / live map / STOP / SOS) |

All interactive pages start with `"use client"` (React client components);
data is fetched from the API with `fetch`.

### 4.2 Reusable components (`src/components/`)

- **`MapView.tsx`** — map engine wrapper. Accepts `markers` (vehicles with
  number + speed labels and status colours) and an optional `path` polyline
  (trip archive). Loads Google Maps if `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is
  set, otherwise dynamically imports Leaflet (browser-only) with OSM tiles.
- **`TopBar.tsx`** — terminal identity bar with insignia, user and logout.
- **`McteLogo.tsx`** — displays the official insignia asset.
- **`MtParkPanel.tsx`** — Admin *Live Control* tab: IN/OUT register,
  contingency alarms, ANPR photo grid, auto-scan toggle, totals.
- **`ArchivePanel.tsx`** — Admin *Archive* tab: queryable trip history and a
  modal that draws the GPS route on a map with gate photos and incidents.
- **`AdminPanel.tsx`** — Admin *Personnel & Fleet* tab: create/delete
  accounts and vehicles, single and bulk.
- **`JcoMtPanel.tsx`** — JCO-side MT Park status and shared alarms.

### 4.3 Client utilities (`src/lib/`)

- **`session.ts`** — login session persisted in `localStorage` (implements
  the *one-time login*: the app reopens straight into the terminal).
- **`geo.ts`** — unified GPS watcher: uses the **native Capacitor
  Geolocation** plugin inside the APK (requests
  `ACCESS_FINE_LOCATION`), and `navigator.geolocation` in a browser.
- **`simulate.ts`** — generates a realistic moving route for indoor demos
  when no GPS fix is available ("Simulated GPS" toggle).
- **`ops.ts`** — the MT Park business/rule engine (see §7).

### 4.4 Driver terminal flow (simplified, as specified)

1. One-time login.
2. Screen shows only the **vehicle-number dropdown** and a large circular
   **START** button (disabled until a vehicle is chosen).
3. START creates a trip and begins GPS transmission; the screen becomes a
   full-screen map with two circular buttons: **STOP** (green) and **SOS**
   (red).
4. GPS fixes are captured every ~2.5 s and POSTed to `/api/trips/track`.
5. Gate-driven notifications ("TURN ON/OFF TRACKING") appear as banners.

---

## 5. Database design (PostgreSQL via Drizzle, `src/db/schema.ts`)

| Table | Key columns | Purpose |
|---|---|---|
| `users` | id, name, role (`officer`/`jco`/`driver`), service_no (unique), unit, password | Login accounts |
| `vehicles` | id, reg_no (unique), type, unit, fuel_pct, mileage, maintenance_due, status, **park_status (`in`/`out`)**, **pending_stop_at** | Fleet register + gate state |
| `trips` | id, driver_id→users, vehicle_id→vehicles, started_at, ended_at, status (`active`/`completed`) | One START→STOP movement |
| `positions` | id, trip_id, vehicle_id, lat, lng, speed, heading, accuracy, ts | Raw GPS breadcrumbs (map trail + archive) |
| `gate_events` | id, vehicle_id, direction (`in`/`out`), photo_url, plate_text, confidence, driver_id, ts | Camera/ANPR capture log |
| `incidents` | id, kind, message, vehicle_id, trip_id, driver_id, ts, last_repeat_at, resolved, resolved_at | Open contingency alarms |
| `notifications` | id, target (`admin`/`jco`/`driver:<id>`/`all`), title, message, kind, read | In-terminal messaging & driver nudges |
| `alerts` | id, kind (`sos`/`flag`/…), message, links, resolved | SOS and JCO escalation feed |
| `broadcasts` | id, from_name, to, message, ts | Command-wide text orders |
| `checkpoints` | id, trip_id, lat, lng, note, ts | Manual checkpoint log |

**Relationships:** a `user` (driver) has many `trips`; a `vehicle` has many
`trips` and `gate_events`; each trip has many `positions`; incidents and
notifications reference the affected trip/vehicle/driver.

**Identity invariant enforced by the application:**
`vehicles parked IN + vehicles OUT = total fleet` at all times (shown in the
table footer).

Schema is applied to a fresh database either with `npx drizzle-kit push` or
by visiting the **`/api/setup`** endpoint once (creates tables/columns
idempotently and seeds the single built-in administrator).

---

## 6. Backend / REST API

Route handlers live in `src/app/api/**/route.ts` and exchange JSON.

| Method & endpoint | Function |
|---|---|
| `POST /api/auth/login` | Validate service number + password + role; return user profile |
| `GET /api/users` · `POST /api/users` · `DELETE /api/users?id=` | List / create (single or **bulk** text) / delete accounts |
| `GET /api/vehicles` · `POST /api/vehicles` · `DELETE /api/vehicles?id=` | Fleet CRUD (bulk supported) |
| `GET /api/trips?userId=` | Driver's currently active trip (resume after app restart) |
| `POST /api/trips` | START: create trip, first position, mark vehicle active; invokes rule engine |
| `POST /api/trips/track` | Ingest a GPS fix (lat/lng/speed/heading/accuracy) |
| `POST /api/trips/action` | `complete` (STOP), `checkpoint`, or `sos` |
| `GET /api/tracking/live` | Live fleet snapshot for Admin/JCO maps (latest fix, age→status) |
| `POST /api/gate/scan` | Camera scan: JSON `{vehicleId, direction}` **or multipart photo** — the photo path runs ANPR, matches the fleet and logs the scan |
| `POST /api/anpr/recognize` | Reads the plate from an uploaded photo (cloud or on-board OCR) and returns ranked fleet matches |
| `POST /api/gate/simulate` | Demo helper: simulates the next camera crossing |
| `GET /api/ops/state` | Full MT Park dashboard payload (also **runs the rule engine** first) |
| `GET /api/notifications?userId=&role=` · `POST /api/notifications` | Per-terminal inbox; mark read |
| `POST /api/incidents` | Acknowledge/resolve an alarm |
| `GET /api/alerts` · `POST /api/alerts` | SOS/flag list; resolve or create (JCO escalation) |
| `GET /api/broadcasts` · `POST /api/broadcasts` | Command orders |
| `GET /api/trips/archive?status=` | All trips with point counts; **distance computed in JS (haversine)** |
| `GET /api/trips/:id` | Full trip record: decimated GPS path, gate scans in window, incidents |
| `GET /api/setup` | One-click schema creation + seed (admin/admin) for deployment |
| `GET /api/health` | Liveness probe used by hosting |

**Security model (project scope):** password verification is server-side;
the only built-in account is the central administrator
(`admin`/`admin`); all driver/JCO accounts are created by the administrator.
For a fielded system this would be extended with hashed passwords (e.g.
bcrypt), session tokens/JWT, HTTPS-only cookies and role middleware on every
route — noted under Future Work.

---

## 7. The MT Park rule engine (`src/lib/ops.ts`)

`gateScan()` handles a camera event and `evaluate()` runs on every dashboard
poll (each Admin/JCO refresh). The four specified contingencies:

1. **OUT but tracking OFF** — when a vehicle is scanned OUT and has no active
   trip: create a `tracking_off_out` incident; alarm Admin + JCO; send the
   driver *"TURN ON TRACKING — you are OUT of MT park."* Cleared
   automatically when the driver presses START.
2. **Tracking ON while still INSIDE after 5 minutes** — active trip, vehicle
   park state still `in`, age ≥ 5 min: one alarm to Admin, JCO and driver.
3. **STOP while still OUT** — completing a trip while park state is `out`:
   raise a `stopped_out` incident and **re-notify every 60 seconds**
   (`last_repeat_at`) until the vehicle is scanned back IN.
4. **IN with tracking still ON** — scan IN with an active trip: notify to
   switch tracking off and set `pending_stop_at = now + 2 min`; the evaluator
   **auto-completes the trip** when the grace expires.

Gate scans also resolve any incidents that are no longer valid (safe return
clears rule 1/2/3). Every scan stores a demo photograph with a synthetic
**ANPR plate reading and confidence %** — the insertion point for the real
camera's webhook later (same API, real image URL + OCR text).

**Live vehicle status** (`/api/tracking/live`) compares the latest GPS
timestamp with the current time: fresh (<30 s) = moving (green), stale =
amber, SOS trip = red.

---

## 8. How a typical movement works (end-to-end trace)

1. Driver logs in once → selects `0045 KJ 2231` → presses **START**.
2. `POST /api/trips` creates the trip; the phone begins GPS uploads to
   `/api/trips/track`; the Admin/JCO map now shows the moving marker.
3. The gate camera scans the vehicle leaving → `POST /api/gate/scan`
   (direction `out`). A photo + plate reading is stored, the register moves
   the row OUT, and because tracking is already ON a confirmation is sent.
4. If the driver had forgotten START, rule 1 alarms the control room and
   pushes a notification to the phone.
5. During the trip, SOS creates an alert; broadcasts appear as banners.
6. On return the camera scans direction `in`: the row moves to IN; if
   tracking is still on, the driver is told to stop and it auto-stops within
   2 minutes; pressing STOP earlier while still OUT triggers rule 3 with
   1-minute repeats.
7. Everything is retained: the **Archive** tab opens the trip with its full
   GPS trail, distance, duration, max speed, gate photos and any incidents.

---

## 9. Maps implementation

- `MapView` initialises **Google Maps** when
  `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` exists in the environment (loaded
  dynamically with a ready callback); markers use custom DOM-style icons
  with colour-coded status and pulse animation.
- Without a key it uses **Leaflet + OpenStreetMap raster tiles**, so the
  project works out-of-the-box at zero cost.
- Archive routes are drawn as polylines; the camera auto-fits bounds; START
  is green, END red, live position is a pulsing gold marker.

---

## 9B. Automatic Number Plate Recognition (ANPR)

The gate camera sends a photograph to the server, which reads the vehicle
number and performs the IN/OUT scan automatically — no manual vehicle
selection when the read is confident.

### Pipeline

```
Gate camera / phone / file  ──multipart JPEG──▶  POST /api/anpr/recognize
                                                         │
                              sharp pre-processing (upscale, grayscale,
                              contrast normalisation, binarisation)
                                                         │
                 ┌───────────────────────────────────────┴───────────────────────┐
         PLATE_RECOGNIZER_TOKEN                            (token absent)
         set → Plate Recognizer cloud           on-board OCR: tesseract.js (WASM,
         (India region, high accuracy)           English model, character whitelist,
                 │                                PSM 11 + PSM 7, two image variants)
                 └───────────────────────────────┬────────────────────────────────┘
                                                  ▼
                          Plate extraction: regex for both Indian civilian
                          format (MP 09 AB 1234) and MT/military numeric
                          format (0012 AB 3456), with OCR-confusion
                          corrections (O↔0, I↔1, B↔8, Z↔2, S↔5…)
                                                  ▼
                          Levenshtein matching against the registered
                          fleet, ranked 0–100%
```

- **`POST /api/anpr/recognize`** returns `{plate, confidence, engine,
  matches[], thumbDataUrl}` and is used by the capture screen for
  operator review/confirmation.
- **`POST /api/gate/scan`** (multipart) does the whole thing end to end:
  OCR → best fleet match; at ≥85% similarity it logs the IN/OUT event
  immediately (storing the **actual photo**, downscaled to a JPEG data URL
  in `gate_events.photo_url` so it persists in the database); otherwise it
  returns `needConfirmation: true` with ranked matches, and the operator
  picks/corrects the plate in a dialog before confirming.
- The capture UI (`AnprGate.tsx`) supports **live camera**
  (`getUserMedia`, rear camera on phones) and **photo upload**; the plate
  text is always editable to override a misread.
- A future hardware camera posts the same multipart request directly — no
  UI changes are needed; the JSON manual scan buttons remain as fallback.

**Accuracy note:** the built-in Tesseract OCR is free and works offline but
is sensitive to angle, glare and plate condition — good for a demo and
clean gate-camera frames. For field accuracy, register a free Plate
Recognizer token (2,500 reads/month, India-trained) and set
`PLATE_RECOGNIZER_TOKEN` in the environment; the code switches engines
automatically. `tesseract.js` is listed in `serverExternalPackages`
(Next.js config) because it spawns native WASM workers.

---

## 10. Deployment: GitHub → Render (how the website is hosted)

1. **Code in GitHub.** The full project (excluding generated `node_modules`
   and `.next`) is uploaded to a GitHub repository.
2. **Database.** Render → New → PostgreSQL (free). Its **Internal Database
   URL** is copied.
3. **Web service.** Render → New → Web Service → connect the GitHub repo:
   - Build Command: `npm install && node scripts/gen-icons.mjs && npm run build`
   - Start Command: `npm start`
   - Environment variable: `DATABASE_URL=<copied Postgres URL>`
   - (optional) `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
4. **First-run setup.** After deployment, open
   `https://<app>.onrender.com/api/setup` once — it creates all tables and
   the built-in admin (`admin`/`admin`).
5. **Continuous deployment.** Every `git push` / GitHub upload triggers a
   fresh Render build automatically; the URL never changes.
6. Free-tier note: the service sleeps after ~15 minutes idle and wakes in
   ~30–60 s on the next request; data is persistent.

### 10.1 Turning it into an Android app

Two no-cost routes, both documented in the repo:
- **PWA Builder (pwabuilder.com):** enter the HTTPS URL → package for
  Android → produces a signed `app-release-signed.apk`; upload the generated
  `assetlinks.json` to `public/.well-known/` for a full-screen (no address
  bar) Trusted Web Activity.
- **GitHub Actions:** the workflow `.github/workflows/build-apk.yml` builds
  a debug APK in the cloud on demand (inputs: live server URL), generates
  launcher icons from the insignia, injects GPS permissions, and attaches
  the APK as a downloadable artifact.

The APK is a shell that loads the live Render URL, so website updates need
**no app rebuild**; native GPS permission is declared in the Android
manifest (`ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, INTERNET).

### 10.2 Offline behaviour

`public/sw.js` (service worker) uses network-first for pages/APIs, cache-first
for static assets, and serves a branded `offline.html` when the network is
down. Caching is versioned; error responses (e.g. 404) are never cached.

---

## 11. Project structure

```
src/
  app/
    page.tsx                 Login / terminal chooser
    officer|jco|driver/      Role dashboards
    api/...                  REST route handlers (§6)
  components/                UI building blocks (§4.2)
  lib/                       session, GPS, simulator, rule engine
  db/                        Drizzle client + schema
public/
  icons/, gate/              PWA icons, ANPR demo photos, manifest, sw.js
scripts/
  seed.sql                   Reference seed data
  gen-icons.mjs              Icon generation (sharp)
android/                     Capacitor native project (APK)
.github/workflows/           Cloud APK build pipeline
capacitor.config.ts          APK identity and server URL
```

---

## 12. Testing performed

- Authentication: correct and incorrect credentials, role mismatch.
- Gate lifecycle: IN→OUT→IN transitions, duplicate-scan rejection, totals
  invariant.
- All four contingencies including fast-forwarding the 2-minute auto-stop
  and verifying the 1-minute repeat cadence.
- GPS pipeline: fix ingestion → live map status (moving/stale/SOS).
- Archive: trip list, route polyline, distance via haversine, gate photos
  attached to the correct trip window.
- Build pipeline: `tsc --noEmit`, `next build`, and a dry run of the GitHub
  Actions steps on a freshly generated Android project.

---

## 13. Limitations and future work

1. Connect the physical gate camera to POST its frame to
   `/api/gate/scan` (ANPR is already implemented; for field-grade accuracy
   set `PLATE_RECOGNIZER_TOKEN`, add trigger/motion capture, and persist
   photos to object storage instead of database data URLs).
2. Password hashing (bcrypt/argon2), JWT sessions and per-route authorization.
3. Replace polling with WebSockets/SSE for sub-second updates and push
   notifications (FCM) when the driver app is backgrounded.
4. Geofencing the MT Park polygon so scans/GPS agree automatically; route
   assignment and road-space scheduling (the strategic C2 features).
5. Signed release builds on the Play Store; encrypted offline queue for GPS
   fixes captured without signal.

---

## 14. Quick reference (viva)

- *What framework?* Next.js (React + TypeScript) full-stack, PostgreSQL via
  Drizzle ORM, Leaflet/Google maps, Capacitor for Android.
- *Where does GPS come from?* Native geolocation in the APK, browser
  geolocation on web, with a simulation mode for demos.
- *How is IN/OUT maintained?* Camera scans write gate events and flip
  `vehicles.park_status`; the UI derives IN/OUT counts and totals.
- *How are alarms automatic?* A server rule engine cross-checks gate state
  vs active trips on every refresh and emits incidents + notifications with
  the required timers.
- *How is it deployed?* GitHub push → Render builds and hosts over HTTPS;
  the database is Render PostgreSQL; APKs are built in GitHub Actions or
  PWA Builder and simply load the hosted URL.
