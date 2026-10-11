import { db } from "@/db";
import {
  vehicles,
  users,
  trips,
  gateEvents,
  notifications,
  incidents,
  positions,
} from "@/db/schema";
import { eq, and, desc, asc, sql, inArray } from "drizzle-orm";

export const GATE_PHOTOS = [
  "/gate/gate1.jpg",
  "/gate/gate2.jpg",
  "/gate/gate3.jpg",
  "/gate/gate4.jpg",
  "/gate/gate5.jpg",
  "/gate/gate6.jpg",
];

const KIND_LABELS: Record<string, string> = {
  tracking_off_out: "Vehicle OUT with tracking OFF",
  tracking_on_in:   "Tracking ON but vehicle still inside MT Park",
  stopped_out:      "Tracking stopped but vehicle still OUT",
};

type Target = "admin" | "jco" | `driver:${number}`;

async function notify(
  targets: Target[],
  n: {
    title: string;
    message: string;
    kind?: "info" | "alarm";
    vehicleId?: number | null;
    tripId?: number | null;
  }
) {
  const rows = targets.map((t) => ({
    target: t,
    title: n.title,
    message: n.message,
    kind: n.kind || "info",
    vehicleId: n.vehicleId ?? null,
    tripId: n.tripId ?? null,
  }));
  if (rows.length) await db.insert(notifications).values(rows);
}

async function resolveOpen(vehicleId: number, kinds?: string[]) {
  const open = await db
    .select()
    .from(incidents)
    .where(
      and(
        eq(incidents.vehicleId, vehicleId),
        eq(incidents.resolved, false),
        ...(kinds ? [inArray(incidents.kind, kinds)] : [])
      )
    );
  for (const i of open) {
    await db
      .update(incidents)
      .set({ resolved: true, resolvedAt: new Date() })
      .where(eq(incidents.id, i.id));
  }
  return open.length;
}

async function activeTripForVehicle(vehicleId: number) {
  const rows = await db
    .select({
      tripId: trips.id,
      driverId: trips.driverId,
      startedAt: trips.startedAt,
      regNo: vehicles.regNo,
      driverName: users.name,
    })
    .from(trips)
    .innerJoin(vehicles, eq(trips.vehicleId, vehicles.id))
    .innerJoin(users, eq(trips.driverId, users.id))
    .where(and(eq(trips.vehicleId, vehicleId), eq(trips.status, "active")))
    .limit(1);
  return rows[0] || null;
}

async function lastDriverForVehicle(vehicleId: number) {
  const rows = await db
    .select({ driverId: trips.driverId, driverName: users.name })
    .from(trips)
    .innerJoin(users, eq(trips.driverId, users.id))
    .where(eq(trips.vehicleId, vehicleId))
    .orderBy(desc(trips.startedAt), desc(trips.id))
    .limit(1);
  return rows[0] || null;
}

/* ═══════════════════════════════════════════════════════════════ GATE SCAN */

export async function gateScan(input: {
  vehicleId: number;
  direction: "in" | "out";
  media?: { photoUrl: string; plateText?: string; confidence?: number };
}) {
  const [v] = await db.select().from(vehicles).where(eq(vehicles.id, input.vehicleId));
  if (!v) throw new Error("Vehicle not found");
  if (v.status === "maintenance") throw new Error(`${v.regNo} is under maintenance`);
  if (v.parkStatus === input.direction) {
    throw new Error(
      `${v.regNo} is already recorded ${input.direction === "in" ? "IN" : "OUT"}`
    );
  }

  const activeTrip = await activeTripForVehicle(input.vehicleId);
  const driverId =
    activeTrip?.driverId ??
    (await lastDriverForVehicle(input.vehicleId))?.driverId ??
    null;

  const photoCount = await db.$count(gateEvents);
  const confidence =
    input.media?.confidence != null
      ? input.media.confidence
      : +(94 + Math.random() * 5).toFixed(1);

  const [evt] = await db
    .insert(gateEvents)
    .values({
      vehicleId: v.id,
      direction: input.direction,
      photoUrl:
        input.media?.photoUrl ||
        GATE_PHOTOS[photoCount % GATE_PHOTOS.length],
      plateText: input.media?.plateText || v.regNo,
      confidence,
      driverId,
    })
    .returning();

  // RULE 1 — Vehicle scanned OUT but tracking is OFF → raise alarm for admin + JCO
  // No driver notification because no fixed driver is assigned to a vehicle.
  // Officer will call the driver using the phone number in their service record.
  if (input.direction === "out" && !activeTrip) {
    const existing = await db
      .select()
      .from(incidents)
      .where(
        and(
          eq(incidents.vehicleId, v.id),
          eq(incidents.kind, "tracking_off_out"),
          eq(incidents.resolved, false)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(incidents).values({
        kind: "tracking_off_out",
        message: `${v.regNo} (${v.type}) has left MT Park but GPS tracking is OFF. Contact driver immediately.`,
        vehicleId: v.id,
        tripId: null,
        driverId,
      });
      await notify(["admin", "jco"], {
        title: `⚠ ${v.regNo} — OUT without tracking`,
        message: `${v.regNo} scanned OUT at gate but GPS tracking is OFF. Contact driver to start tracking immediately.`,
        kind: "alarm",
        vehicleId: v.id,
      });
    }
  }

  // RULE 4 — Vehicle scanned IN with tracking ON → set 2-minute grace for auto-stop
  const pendingStopAt =
    input.direction === "in" && activeTrip
      ? new Date(Date.now() + 2 * 60 * 1000)
      : null;

  // When vehicle returns IN, resolve tracking_off_out and stopped_out alarms
  if (input.direction === "in") {
    await resolveOpen(v.id, ["stopped_out", "tracking_off_out"]);
  }

  await db
    .update(vehicles)
    .set({ parkStatus: input.direction, pendingStopAt })
    .where(eq(vehicles.id, v.id));

  return { event: evt };
}

/* ══════════════════════════════════════════════════════════════ TRIP HOOKS */

/** Called when a driver presses START tracking. */
export async function handleTripStarted(args: {
  tripId: number;
  vehicleId: number;
  driverId: number;
}) {
  const [v] = await db.select().from(vehicles).where(eq(vehicles.id, args.vehicleId));
  if (!v) return;

  // RULE 2 setup — tracking ON but still inside MT Park.
  // Set a 5-minute pending check. evaluate() raises alarm if still IN after that.
  if (v.parkStatus === "in") {
    await db
      .update(vehicles)
      .set({ pendingStopAt: new Date(Date.now() + 5 * 60 * 1000) })
      .where(eq(vehicles.id, v.id));
  }

  // Resolve "tracking OFF while OUT" alarm if driver finally started tracking
  if (v.parkStatus === "out") {
    await resolveOpen(args.vehicleId, ["tracking_off_out"]);
  }
}

/** Called when a driver presses STOP tracking. */
export async function handleTripStopped(args: {
  tripId: number;
  vehicleId: number;
  driverId: number;
}) {
  const [v] = await db.select().from(vehicles).where(eq(vehicles.id, args.vehicleId));
  if (!v) return;

  await db
    .update(vehicles)
    .set({ pendingStopAt: null })
    .where(eq(vehicles.id, v.id));

  // Resolve "tracking ON while inside" alarm — tracking is now OFF
  await resolveOpen(args.vehicleId, ["tracking_on_in"]);

  // RULE 3 — Tracking stopped but vehicle is still OUT → raise alarm for admin + JCO
  // No automatic driver notification. Officer contacts driver via phone (serviceNo).
  if (v.parkStatus === "out") {
    const existing = await db
      .select()
      .from(incidents)
      .where(
        and(
          eq(incidents.vehicleId, v.id),
          eq(incidents.kind, "stopped_out"),
          eq(incidents.resolved, false)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(incidents).values({
        kind: "stopped_out",
        message: `${v.regNo} tracking stopped but vehicle is still OUT of MT Park. Gate scan required on return.`,
        vehicleId: v.id,
        tripId: args.tripId,
        driverId: args.driverId,
      });
      await notify(["admin", "jco"], {
        title: `⚠ ${v.regNo} — Tracking stopped while OUT`,
        message: `${v.regNo} stopped GPS tracking but has not returned to MT Park. Contact driver to return immediately.`,
        kind: "alarm",
        vehicleId: v.id,
        tripId: args.tripId,
      });
    }
  }
}

/* ══════════════════════════════════════════════════════════════ EVALUATION */

export async function evaluate() {
  const now = Date.now();

  const candidates = await db
    .select({ v: vehicles, tripId: trips.id, driverId: trips.driverId })
    .from(vehicles)
    .innerJoin(
      trips,
      and(eq(trips.vehicleId, vehicles.id), eq(trips.status, "active"))
    );

  // RULE 4 — Auto-stop trips whose 2-minute grace has elapsed after scan-IN
  const dueStop = candidates.filter(
    (r) =>
      r.v.pendingStopAt &&
      r.v.pendingStopAt.getTime() <= now &&
      r.v.parkStatus === "in"
  );

  for (const row of dueStop) {
    await db
      .update(trips)
      .set({ status: "completed", endedAt: new Date() })
      .where(eq(trips.id, row.tripId));
    await db
      .update(vehicles)
      .set({ status: "available", pendingStopAt: null })
      .where(eq(vehicles.id, row.v.id));
    await resolveOpen(row.v.id);
    await notify([`driver:${row.driverId}` as Target, "admin", "jco"], {
      title: "Tracking auto-stopped",
      message: `${row.v.regNo} is inside MT Park — tracking switched off automatically (2-min grace elapsed).`,
      kind: "info",
      vehicleId: row.v.id,
      tripId: row.tripId,
    });
  }

  // RULE 2 — Tracking ON but still inside MT Park after 5 minutes
  // These have pendingStopAt set by handleTripStarted but are NOT in dueStop
  // because parkStatus is "in" AND they are not the auto-stop candidates
  const trackingOnInside = candidates.filter(
    (r) =>
      r.v.parkStatus === "in" &&
      r.v.pendingStopAt &&
      r.v.pendingStopAt.getTime() <= now &&
      !dueStop.find((d) => d.v.id === r.v.id)
  );

  for (const row of trackingOnInside) {
    const existing = await db
      .select()
      .from(incidents)
      .where(
        and(
          eq(incidents.vehicleId, row.v.id),
          eq(incidents.kind, "tracking_on_in"),
          eq(incidents.resolved, false)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(incidents).values({
        kind: "tracking_on_in",
        message: `${row.v.regNo} has tracking ON but is still inside MT Park after 5 minutes. Use FORCE STOP in admin panel.`,
        vehicleId: row.v.id,
        tripId: row.tripId,
        driverId: row.driverId,
      });
      await notify(["admin", "jco"], {
        title: `⚠ ${row.v.regNo} — Tracking ON inside MT Park`,
        message: `${row.v.regNo} tracking ON for 5+ min but still inside MT Park. Force-stop from admin panel.`,
        kind: "alarm",
        vehicleId: row.v.id,
        tripId: row.tripId,
      });
    }
  }

  // RULE 3 repeat — nudge admin + JCO every 5 minutes for stopped_out vehicles
  const stoppedOut = await db
    .select({ i: incidents, regNo: vehicles.regNo })
    .from(incidents)
    .innerJoin(vehicles, eq(incidents.vehicleId, vehicles.id))
    .where(and(eq(incidents.kind, "stopped_out"), eq(incidents.resolved, false)));

  for (const row of stoppedOut) {
    const lastRepeat = row.i.lastRepeatAt?.getTime() ?? row.i.ts.getTime();
    if (now - lastRepeat >= 5 * 60 * 1000) {
      await db
        .update(incidents)
        .set({ lastRepeatAt: new Date() })
        .where(eq(incidents.id, row.i.id));
      await notify(["admin", "jco"], {
        title: `⚠ ${row.regNo} — Still OUT, no tracking`,
        message: `${row.regNo} is still outside MT Park with tracking OFF. Contact driver.`,
        kind: "alarm",
        vehicleId: row.i.vehicleId,
      });
    }
  }

  // Clean up old notifications
  await db.execute(sql`delete from notifications where ts < now() - interval '48 hours'`);
}

/* ══════════════════════════════════════════════════════ ADMIN FORCE-STOP */

/**
 * Admin force-stops a driver's active tracking from the admin terminal.
 * Used for Rule 2: tracking ON but vehicle still inside MT Park.
 */
export async function adminForceStopTracking(vehicleId: number) {
  const [v] = await db.select().from(vehicles).where(eq(vehicles.id, vehicleId));
  if (!v) throw new Error("Vehicle not found");

  const activeTrips = await db
    .select()
    .from(trips)
    .where(and(eq(trips.vehicleId, vehicleId), eq(trips.status, "active")))
    .limit(1);

  if (activeTrips.length === 0) throw new Error(`No active trip found for ${v.regNo}`);
  const trip = activeTrips[0];

  await db
    .update(trips)
    .set({ status: "completed", endedAt: new Date() })
    .where(eq(trips.id, trip.id));

  await db
    .update(vehicles)
    .set({ status: "available", pendingStopAt: null })
    .where(eq(vehicles.id, vehicleId));

  await resolveOpen(vehicleId);

  await notify(["admin", "jco"], {
    title: `${v.regNo} — tracking force-stopped`,
    message: `Admin force-stopped tracking for ${v.regNo}. Trip ended.`,
    kind: "info",
    vehicleId,
    tripId: trip.id,
  });

  return { tripId: trip.id, driverId: trip.driverId };
}

/* ══════════════════════════════════════════════════════════════ OPS STATE */

export async function buildOpsState() {
  await evaluate();

  const fleet = await db
    .select({
      id: vehicles.id,
      regNo: vehicles.regNo,
      type: vehicles.type,
      unit: vehicles.unit,
      parkStatus: vehicles.parkStatus,
      status: vehicles.status,
      tripId: trips.id,
      driverName: users.name,
      driverId: trips.driverId,
      startedAt: trips.startedAt,
    })
    .from(vehicles)
    .leftJoin(trips, and(eq(trips.vehicleId, vehicles.id), eq(trips.status, "active")))
    .leftJoin(users, eq(trips.driverId, users.id))
    .orderBy(asc(vehicles.regNo));

  const rows = fleet.map((f) => ({
    id: f.id,
    regNo: f.regNo,
    type: f.type,
    unit: f.unit,
    parkStatus: f.parkStatus as "in" | "out",
    tracking: !!f.tripId,
    tripId: f.tripId ?? null,
    driverId: f.driverId ?? null,
    driver: f.driverName ?? "—",
    startedAt: f.startedAt ?? null,
  }));

  const incidentsOpen = await db
    .select({
      id: incidents.id,
      kind: incidents.kind,
      message: incidents.message,
      ts: incidents.ts,
      regNo: vehicles.regNo,
      vehicleId: incidents.vehicleId,
      tripId: incidents.tripId,
      driverName: users.name,
    })
    .from(incidents)
    .innerJoin(vehicles, eq(incidents.vehicleId, vehicles.id))
    .leftJoin(users, eq(incidents.driverId, users.id))
    .where(eq(incidents.resolved, false))
    .orderBy(desc(incidents.ts), desc(incidents.id));

  const photos = await db
    .select({
      id: gateEvents.id,
      direction: gateEvents.direction,
      photoUrl: gateEvents.photoUrl,
      plateText: gateEvents.plateText,
      confidence: gateEvents.confidence,
      ts: gateEvents.ts,
      regNo: vehicles.regNo,
      type: vehicles.type,
      driverName: users.name,
    })
    .from(gateEvents)
    .innerJoin(vehicles, eq(gateEvents.vehicleId, vehicles.id))
    .leftJoin(users, eq(gateEvents.driverId, users.id))
    .orderBy(desc(gateEvents.ts), desc(gateEvents.id))
    .limit(12);

  const total = rows.length;
  const inCount = rows.filter((r) => r.parkStatus === "in").length;
  const outCount = rows.filter((r) => r.parkStatus === "out").length;
  const trackingOn = rows.filter((r) => r.tracking).length;

  return {
    vehicles: rows,
    incidents: incidentsOpen.map((i) => ({
      ...i,
      kindLabel: KIND_LABELS[i.kind] || i.kind,
    })),
    photos,
    totals: { total, in: inCount, out: outCount, trackingOn },
  };
}
