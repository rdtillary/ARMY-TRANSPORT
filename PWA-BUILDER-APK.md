# Building the APK with PWA Builder (no Android Studio)

PWA Builder (free, by Microsoft) wraps your live HTTPS website into a real,
installable Android APK in the browser. It uses an Android "Trusted Web
Activity" — a native app with no address bar that opens your site full screen.

Prerequisite: the website is live, e.g. https://mctetransportsys.onrender.com

---

## Part 1 — Upload the prepared PWA files and redeploy (one time)

The repo must contain the current PWA assets:

- `public/manifest.webmanifest` (name, icons, colours)
- `public/sw.js` (service worker — offline support)
- `public/offline.html` (offline page)
- `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png`
  (flat in the public ROOT — not inside a subfolder)
- `public/mcte-logo.png`

Upload anything missing directly into the `public` folder on GitHub and let
Render redeploy green. Optional Render Build Command (regenerates icons on deploy):

```
npm install && node scripts/gen-icons.mjs && npm run build
```

## Part 2 — Check the site passes the PWA test card

1. Open **https://www.pwabuilder.com**
2. In the big URL box paste: `https://mctetransportsys.onrender.com`
3. Click **Start** (if the free Render site is asleep, the first attempt can
   time out — wait 60 s, then click Start again)
4. You get a report card with four sections:
   - **Manifest** — must be green (this is required)
   - **Service Worker** — green/amber (our `sw.js` handles offline + caching)
   - **Security** — green automatically (HTTPS from Render)
   - If Manifest is red, expand it — it names the exact missing icon/field;
     fix and redeploy before continuing

## Part 3 — Package for Android

1. Click the **Package / Download** button (top right)
2. Choose **Android**
3. A dialog opens — fill it in:
   - **Package ID:** `com.mcte.transport` (must contain at least two
     dot-separated words)
   - **App name:** `MCTE Transport`
   - **Launcher name:** `MCTE Transport`
   - **Version:** `1.0.0.0` (or leave default)
   - If you see an **Advanced/Features** option for **Location / Geolocation**,
     turn it **ON** (driver GPS)
   - **Signing key:** choose to **generate a new keystore in the cloud**
     (easiest). Save the shown keystore password/credentials — you need them
     to publish updates later.
4. Click **Download Package** / **Generate**
5. Wait ~1–2 minutes, then a ZIP downloads (e.g. `mctetransportsys.zip`)

## Part 4 — What's inside the ZIP

Extract it. It contains:
- **app-release-signed.apk** ← the installable app (use this one)
- `assetlinks.json` ← removes the browser address bar (see Part 5)
- signing-key files / info ← keep these somewhere safe
- full Android source (only needed if you ever use Android Studio)

## Part 5 — Make it full screen (Digital Asset Link) — IMPORTANT

Without this step the app shows a browser URL bar at the top.

1. Open `assetlinks.json` from the ZIP with Notepad; select all and copy.
2. On GitHub, open your repo and click into the **`public`** folder.
3. **Add file → Create new file**
4. In the name box type exactly:
   ```
   .well-known/assetlinks.json
   ```
   (typing the slash creates the folder automatically)
5. Paste the copied JSON into the editor → **Commit changes**
6. Wait for Render to redeploy (~4 min), then verify in your browser:
   ```
   https://mctetransportsys.onrender.com/.well-known/assetlinks.json
   ```
   You must see the JSON text. (If your site already had an APK with a
   different key, replace the file contents and redeploy again.)

## Part 6 — Install on the phone

1. Copy `app-release-signed.apk` to the phone (USB → Downloads, or
   Google Drive / email).
2. Tap it in the Files/Downloads app.
3. **Settings → Allow from this source → Install**
4. Play Protect warning → **More details → Install anyway**
5. Open **MCTE Transport** — no address bar; it loads your Render site.
6. Log in with an account created from the Admin terminal (Admin login is
   `admin` / `admin`) → **While using the app** for the
   location prompt → vehicle dropdown → big START.

## Updating the app later

- Website-only changes: nothing to do — the APK always loads the live site.
- New icon/name/version: repeat Parts 3–4; if a NEW signing key is generated
  you must re-upload the new `assetlinks.json` (Part 5). Keep the same key to
  avoid that — use the stored keystore option in PWA Builder.

## Troubleshooting

| Symptom | Fix |
|---|---|
| PWA Builder shows a red Manifest card | Wait for the latest Render deploy; confirm `/manifest.webmanifest` opens in the browser and `/icon-512.png` shows the insignia (flat root path) |
| "URL cannot be found / timeout" | Free Render sleeping — load the site once in a tab, wait 60 s, retry Start |
| App opens with a URL/address bar | Part 5 not done or not deployed — verify the assetlinks URL returns JSON, then close & reopen the app |
| Install blocked by Play Protect | More details → Install anyway (normal for apps outside the Play Store) |
| GPS never activates | Re-package with the Location/Geolocation feature enabled (Part 3), or use the in-app SIMULATED GPS toggle for demos |
| Want it on Google Play | Use the `.aab` bundle from the ZIP (PWA Builder offers it) and upload via Play Console ($25 one-time developer fee) |
