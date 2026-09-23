# Administration — personnel, vehicles & logins

## The one built-in login
The central control room administrator is the only account created
automatically:

- Terminal: **Admin** (first card on the login screen)
- ID: **admin**
- Password: **admin**

There are no other built-in accounts. Every JCO and Driver login is created
from the Admin terminal.

## Where the controls are
1. Log in at the **Admin** terminal (`admin` / `admin`) — displayed in the
   Central Control Room.
2. Scroll to the **PERSONNEL & FLEET ADMINISTRATION** panel.
3. Use the **PERSONNEL** / **VEHICLES** tabs.

## Add one account
Full name → Role (Driver / JCO / Admin) → Service number → Unit →
optional password → **ADD ACCOUNT**.
- If no password is entered, it defaults to `army123` — give this to the
  person (or set a unique password at creation).
- New IDs can log in immediately; duplicate service numbers are rejected.

## Add many accounts at once — bulk box
One person per line, comma or pipe separated:

```
role, serviceNo, name, unit
driver, DRV-3005, Sgt R. Kumar, 7th Armoured
driver, DRV-3006, L/Nk A. Khan, 12th Mechanised
jco, JCO-2003, Hav P. Das, Signal Corps
admin, ADM-002, Maj S. Gill, Central Control Room
```

Lines starting with `#` are ignored; bad/duplicate lines are reported while
valid lines are still added.

## Add one vehicle
Registration number → Type → Unit → Fuel % → **ADD VEHICLE**.
New vehicles appear in every driver's vehicle dropdown automatically.
A vehicle on an active trip cannot be deleted until the trip is stopped.

## Add many vehicles at once
```
regNo, type, unit
0012 AB 9999, Truck 5T (Tata), 7th Armoured
0045 KJ 1212, Ambulance (Force), 3rd Cavalry
```

## API endpoints used (must be in the GitHub repo)
- `src/app/api/users/route.ts` (GET/POST/DELETE)
- `src/app/api/vehicles/route.ts` (GET/POST/DELETE)
- `src/components/AdminPanel.tsx`
- `src/app/officer/page.tsx`

Data is stored permanently in the Render PostgreSQL database.
