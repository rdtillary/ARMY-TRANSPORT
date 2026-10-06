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
  tracking_off_out: "OUT with tracking OFF",
  tracking_on_in: "Tracking ON but still inside MT park",
  stopped_out: "Tracking stopped but still OUT",
};

type Target = "admin" | "jco" | `driver:${number}`;

async function notify(targets: Target[], n: {
  title: string;
  message: string;
  kind?: "info" | "alarm";
  vehicleId?: number | null;
  tripId?: number | null;
}) {
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

/** Active trip (with driver + vehicle) for a vehicle, if any. */
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

/** Most recent driver to use that vehicle (fallback when none is active). */
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

/* ------------------------------------------------------------------ GATE */

/**
 * GATE SCAN FUNCTIONALITY DISABLED
 * 
 * Gate scan and all MT Park location-based contingencies are disabled
 * until the MT Park location is provided. This prevents false alarms
 * from being generated in Admin and JCO terminals.
 * 
 * The following rules are temporarily deactivated:
 * - RULE 1: OUT but tracking is OFF
 * - RULE 2: Tracking ON but still inside MT park after 5 minutes
 * - RULE 3: STOP while still OUT
 * - RULE 4: IN with tracking still ON
 * 
 * Re-enable by uncommenting the gateScan function and evaluate() rule checks.
 */

export async function gateScan(input: {
  vehicleId: number;
  direction: "in" | "out";
  media?: { photoUrl: string; plateText?: string; confidence?: number };
}) {
  // DISABLED: Gate scan functionality is temporarily disabled.
  // Update the vehicle park status without triggering contingency rules.
  
  const [v] = await db.select().from(vehicles).where(eq(vehicles.id, input.vehicleId));
  if (!v) throw new Error("Vehicle not found");
  if (v.status === "maintenance") throw new Error(`${v.regNo} is under maintenance`);
  if (v.parkStatus === input.direction) {
    throw new Error(`${v.regNo} is already recorded ${input.direction === "in" ? "IN" : "OUT"}`);
  }

  const driverId = (await lastDriverForVehicle(input.vehicleId))?.driverId ?? null;
  const photoCount = await db.$count(gateEvents);
  const confidence =
    input.media?.confidence != null
      ? input.media.confidence
      : +(94 + Math.random() * 5).toFixed(1);

  // Record the gate event (for logging only, no rules triggered)
  const [evt] = await db
    .insert(gateEvents)
    .values({
      vehicleId: v.id,
      direction: input.direction,
      photoUrl: input.media?.photoUrl || GATE_PHOTOS[photoCount % GATE_PHOTOS.length],
      plateText: input.media?.plateText || v.regNo,
      confidence,
      driverId,
    })
    .returning();

  // Update park status only
  await db
    .update(vehicles)
    .set({
      parkStatus: input.direction,
      pendingStopAt: null,
    })
    .where(eq(vehicles.id, v.id));

  return { event: evt };
}

/* ------------------------------------------------------------- TRIP HOOKS */

/** Called when a driver presses START. */
export async function handleTripStarted(args: { tripId: number; vehicleId: number; driverId: number }) {
  // DISABLED: Contingency checks disabled until MT Park location is provided
  // No notifications or alarms will be generated
}

/** Called when a driver presses STOP (or tracking is completed). */
export async function handleTripStopped(args: { tripId: number; vehicleId: number; driverId: number }) {
  const [v] = await db.select().from(vehicles).where(eq(vehicles.id, args.vehicleId));
  if (!v) return;
  await db.update(vehicles).set({ pendingStopAt: null }).where(eq(vehicles.id, v.id));
  await resolveOpen(args.vehicleId, ["tracking_on_in"]);
  
  // DISABLED: Rule 3 (stopped while OUT) alarm generation is disabled
}

/* ----------------------------------------------------------- EVALUATION */

/**
 * Evaluation rules are disabled.
 * Only auto-stop grace period (Rule 4) will execute.
 */
export async function evaluate() {
  const now = Date.now();

  // RULE 4: auto-stop trips whose 2-minute grace elapsed after scan-IN.
  const candidates = await db
    .select({
      v: vehicles,
      tripId: trips.id,
      driverId: trips.driverId,
    })
    .from(vehicles)
    .innerJoin(trips, and(eq(trips.vehicleId, vehicles.id), eq(trips.status, "active")));
  const dueStop = candidates.filter(
    (r) => r.v.pendingStopAt && r.v.pendingStopAt.getTime() <= now
  );

  for (const row of dueStop) {
    await db.update(trips).set({ status: "completed", endedAt: new Date() }).where(eq(trips.id, row.tripId));
    await db
      .update(vehicles)
      .set({ status: "available", pendingStopAt: null })
      .where(eq(vehicles.id, row.v.id));
    await resolveOpen(row.v.id);
    const driverId = row.driverId;
    await notify([`driver:${driverId}` as Target, "admin", "jco"], {
      title: "Tracking auto-stopped",
      message: `${row.v.regNo} is inside MT park — tracking was switched off automatically (2-minute grace elapsed).`,
      kind: "info",
      vehicleId: row.v.id,
      tripId: row.tripId,
    });
  }

  // DISABLED: Rule 2 (tracking on while IN after 5 min) - no alarms
  // DISABLED: Rule 3 repeats (stopped while OUT) - no nudge notifications

  // Keep the notifications table from growing forever.
  await db.execute(sql`delete from notifications where ts < now() - interval '48 hours'`);
}

/* ------------------------------------------------------------ OPS STATE */

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
      startedAt: trips.startedAt,
    })
    .from(vehicles)
    .leftJoin(
      trips,
      and(eq(trips.vehicleId, vehicles.id), eq(trips.status, "active"))
    )
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
    incidents: incidentsOpen.map((i) => ({ ...i, kindLabel: KIND_LABELS[i.kind] || i.kind })),
    photos,
    totals: { total, in: inCount, out: outCount, trackingOn },
  };
}
