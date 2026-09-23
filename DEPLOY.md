# Make This Website Permanent (Free) — Beginner Guide

Right now the app lives in a temporary sandbox that reboots and gets a new
URL. This guide moves **everything** to permanent, free cloud services:

| Part | Where it lives permanently | Cost |
|---|---|---|
| Code (backup) | GitHub repository | Free |
| Database (all data) | Render free PostgreSQL | Free |
| Running app (the website) | Render free web service | Free, permanent URL |

Total time: ~20 minutes. No coding required.

---

## Step 0 — Prepare the project on your PC

1. Copy the whole project folder to your PC.
2. **Delete** these two folders inside it (they are auto-generated junk,
   huge, and must NOT be uploaded):
   - `node_modules`
   - `.next`
   (Right-click → Delete. Keep everything else, including `android/`,
   `public/`, `src/`, `scripts/`, `.github/`, `capacitor.config.ts`,
   `package.json`. `package-lock.json` is optional — `npm install`
   regenerates it.)

## Step 1 — Save the code permanently (GitHub)

1. Go to **github.com** → sign in (create a free account if needed).
2. Top-right **+** → **New repository** → name: `army-transport` → **Create**.
3. Click **"uploading an existing file"** → **drag the entire project
   folder contents** (files AND folders) into the box → **Commit changes**.
   - *If drag & drop of folders misbehaves in your browser: zip the project,
     upload the zip, then use an online "unzip on GitHub" tool — or just do
     Step 3 of the APK guide (GitHub Actions) from the unzipped upload.*

   Your code is now saved forever at `github.com/yourname/army-transport`.
   Every future change: edit → upload → saved.

## Step 2 — Create the free database

1. Go to **render.com** → **Sign Up** (free) → sign in **with GitHub**.
2. **New → PostgreSQL**.
   - Choose the **Free** plan, any region close to you, name: `army-db` → **Create**.
3. On the database page, open the **Connect** tab.
4. Copy the **Internal Database URL** (looks like
   `postgresql://user:password@host:5432/army-db?sslmode=require`).
   **Keep it handy** — you'll paste it in the next step.

## Step 3 — Deploy the website

1. Back on Render: **New → Web Service**.
2. **Connect repository:** pick `army-transport` from the list.
3. Fill in:
   - **Name:** `army-transport`
   - **Environment:** Node
   - **Runtime:** Nixpacks (default is fine)
   - **Plan:** Free
   - **Build Command:** `npm install && node scripts/gen-icons.mjs && npm run build`
   - **Start Command:** `npm start`
4. Scroll to **Environment Variables** and add:
   - `DATABASE_URL` = the database URL you copied in Step 2
   - *(optional)* `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` = your Google Maps key —
     without it, OpenStreetMap is used automatically.
5. Click **Create Web Service** and wait 3–6 minutes until the deploy turns
   green and shows **Ready** with your URL, e.g.
   `https://army-transport.onrender.com` ← **THIS IS YOUR PERMANENT URL.**

## Step 4 — Create the tables + demo data (ONE TIME)

Open this once in your browser (replace with YOUR url):

```
https://army-transport.onrender.com/api/setup
```

You should see: `{"ok":true,"message":"Database setup complete","users":4,"vehicles":6,…}`

That's it — all tables created, demo accounts seeded. (For a real deployment,
delete `src/app/api/setup/route.ts` from the code and redeploy so this
endpoint disappears.)

## Step 5 — Use your permanent app

1. Open your permanent URL → the only built-in login is the Admin terminal:
   ID **admin**, password **admin**. Create JCO/Driver accounts from the
   Admin panel (see `ADMIN.md`) — log in once per device.
2. **Phone PWA:** open the permanent URL in Chrome on your phone →
   ⋮ → *Add to Home screen* → it installs forever, pointing at this URL.
3. **APK:** set `capacitor.config.ts` → `server.url` to your permanent URL,
   then rebuild via the GitHub Actions workflow (see `APK-INSTRUCTIONS.md`,
   Path B) or Android Studio (Path C).
4. **Your own passwords/units:** the seeded accounts are demo data. To change
   them: Render → your web service → **Shell** tab → or use any Postgres GUI
   (e.g. the free TablePlus) with your DB URL and edit the `users` table.

---

## Free-plan reality check (read once, no action needed)

- **Sleeping:** free Render services pause after ~15 min of no traffic.
  The first tap after that takes ~30–60 s to wake. Data is never lost.
- **Database:** the free Postgres keeps data forever as long as the account
  exists; it pauses (not deletes) after 15 days of total inactivity.
- **Updates:** change code → upload to GitHub → Render redeploys automatically.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Deploy fails: "Could not find a production build" | Build Command must be `npm install && node scripts/gen-icons.mjs && npm run build` |
| Deploy fails in "build" stage | Make sure the current `package.json` (with the `sharp`, `leaflet` and `@capacitor/*` entries) was uploaded; check the Build Command above |
| App loads but login fails | `DATABASE_URL` env var is wrong/missing, or you never visited `/api/setup` |
| `/api/setup` returns an error JSON | It prints the DB error — almost always the URL. Recopy it exactly, including `?sslmode=require` |
| First page very slow | Free tier waking up from sleep — refresh once |
