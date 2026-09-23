> **Want the website itself to be online permanently (not the temporary
> sandbox)?** Follow **`DEPLOY.md`** — free GitHub + Render hosting with a
> permanent URL, step by step, no coding.

# Army Transport CMS — Getting It on Your Phone

> An APK is a compiled binary — it must be built with the Android toolchain
> (JDK + Android SDK). This web sandbox cannot compile it, so use one of the
> three paths below. **Path A gets an app on your phone in 5 minutes with no
> building at all.**

---

## Path A — Install it right now as an app (PWA, no APK needed)

The app is a PWA. On your phone:

1. Open the app's **HTTPS** URL in **Chrome** (phone on any network that can
   reach the server).
2. Tap **⋮ menu → "Add to Home screen" / "Install app"** → confirm.
3. **Army Transport CMS** appears on your home screen with its own icon and
   opens full-screen like a native app. Login is one-time; GPS tracking works
   (browser geolocation).

That is the fastest way to demo the complete system on a phone.

## Path B — Real APK with zero installs (GitHub Actions)

A ready workflow is included at `.github/workflows/build-apk.yml`. It builds
`app-debug.apk` in the cloud on every push.

1. Create a free account at **github.com**.
2. Click **+ → New repository** → name it (e.g. `army-transport`) → **Create**.
3. Click **uploading an existing file** and upload the project contents
   (or use `git` if you know it). Make sure the `android/` and
   `.github/` folders are included.
4. Open the repo → **Actions** tab → **"Build Android APK"** → it builds
   automatically (10–15 min, free).
5. Click the finished run → **army-transport-apk** artifact at the bottom →
   download `app-debug.apk` → copy to phone → install.

## Path C — Real APK with Android Studio (on your own PC)

Everything for the APK is **already in this repo**:

- `android/` — the complete Capacitor Android project (open directly in Android Studio)
- `@capacitor/geolocation` — native GPS plugin (registered, manifest has location permissions)
- `capacitor.config.ts` — APK configuration
- Web app — Next.js server that every terminal (Officer / JCO / Driver) loads

---

## 1. Run the backend server (the "command" machine)

```bash
npm install
npm run build
npm run start            # serves http://<this-machine-IP>:3000
```

Find the machine's LAN IP (`ipconfig` / `ifconfig`), e.g. `192.168.1.50`.
All devices on the network must reach this URL.

**Google Maps (optional but recommended):** put your key in `.env` before building:

```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaSy...   # Maps JavaScript API key
```

Without a key the app automatically uses OpenStreetMap (still fully functional).

---

## 2. Point the APK at your server

Edit `capacitor.config.ts`:

```ts
server: {
  url: "http://192.168.1.50:3000",   // ← your server's LAN IP (or deployed HTTPS URL)
  androidScheme: "https",
},
```

Then sync so the Android project picks it up:

```bash
npx cap sync android
```

---

## 3. Build in Android Studio

1. Open **Android Studio** → *Open* → select the `android/` folder.
2. Let Gradle sync finish (downloads dependencies on first run).
3. **Debug APK (for testing):** `Build → Build App Bundle(s) / APK(s) → Build APK(s)`
   → APK at `android/app/build/outputs/apk/debug/app-debug.apk`
   (or from terminal: `cd android && ./gradlew assembleDebug`)
4. **Install:** copy the APK to the phone → tap → allow "unknown apps";
   or with USB: `adb install android/app/build/outputs/apk/debug/app-debug.apk`
5. **Release APK (for distribution):** `Build → Generate Signed App Bundle / APK(s) → APK`
   → create a keystore (save it safely) → *Release* variant.

## 4. On the phone

1. Open **Army Transport CMS** from the home screen.
2. Log in with a driver account created from the Admin terminal (the Admin
   login itself is ID `admin` / `admin`).
3. Allow the **location permission** when Android asks (required for GPS).
4. Select vehicle → **START MOVEMENT** → tracking begins.
   The officer & JCO terminals see the vehicle number + position live on their maps.
5. No GPS signal / demo on a desk? Tick **Simulation mode** — the vehicle drives a
   demo route and all three terminals show it in real time.

---

## Login IDs (seeded)

| Terminal | Service No | Password |
|---|---|---|
| Admin (central control room) | admin | admin |
| JCO / Driver | created by the Admin from the Personnel panel | set at creation (default `army123`) |

## Database

PostgreSQL with Drizzle ORM. After a fresh database, apply the schema and seed:

```bash
npx drizzle-kit push
psql "postgresql://postgres:postgres@127.0.0.1:5432/app_db" -f scripts/seed.sql
```
