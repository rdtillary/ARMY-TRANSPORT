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

export async function gateScan(input: {
  vehicleId: number;
  direction: "in" | "out";
  media?: { photoUrl: string; plateText?: string; confidence?: number };
}) {
  const [v] = await db.select().from(vehicles).where(eq(vehicles.id, input.vehicleId));
  if (!v) throw new Error("Vehicle not found");
  if (v.status === "maintenance") throw new Error(`${v.regNo} is under maintenance`);
  if (v.parkStatus === input.direction) {
    throw new Error(`${v.regNo} is already recorded ${input.direction === "in" ? "IN" : "OUT"}`);
  }

  const active = await activeTripForVehicle(input.vehicleId);
  const driverId = active?.driverId ?? (await lastDriverForVehicle(input.vehicleId))?.driverId ?? null;
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
      // Real ANPR capture (data URL) when provided, otherwise the demo photo set.
      photoUrl: input.media?.photoUrl || GATE_PHOTOS[photoCount % GATE_PHOTOS.length],
      plateText: input.media?.plateText || v.regNo,
      confidence,
      driverId,
    })
    .returning();

  await db
    .update(vehicles)
    .set({
      parkStatus: input.direction,
      // scanning IN frees any pending stop flag; scanning OUT clears it too
      pendingStopAt: null,
    })
    .where(eq(vehicles.id, v.id));

  if (input.direction === "out") {
    if (active) {
      // Tracking already on — clear any "tracking on while in" incident.
      await resolveOpen(v.id, ["tracking_on_in"]);
      await notify(
        [
          "admin",
          "jco",
          ...(driverId ? ([`driver:${driverId}`] as Target[]) : []),
        ],
        {
          title: "Vehicle OUT — tracking confirmed",
          message: `${v.regNo} scanned OUT of MT park. Tracking is ON — stay on assigned route.`,
          vehicleId: v.id,
          tripId: active.tripId,
        }
      );
    } else {
      // RULE 1: OUT but tracking is OFF.
      const [inc] = await db
        .insert(incidents)
        .values({
          kind: "tracking_off_out",
          message: `${v.regNo} scanned OUT of MT park but tracking is OFF — driver must start tracking now.`,
          vehicleId: v.id,
          driverId,
          lastRepeatAt: new Date(),
        })
        .returning();
      await notify(["admin", "jco"], {
        title: "ALARM — tracking OFF",
        message: inc.message,
        kind: "alarm",
        vehicleId: v.id,
      });
      if (driverId) {
        await notify([`driver:${driverId}`], {
          title: "TURN ON TRACKING",
          message: `You are OUT of MT park in ${v.regNo}. Press the big START button to turn tracking ON immediately.`,
          kind: "alarm",
          vehicleId: v.id,
        });
      }
    }
  } else {
    // Scanned IN → vehicle safely home. Resolve all open incidents.
    await resolveOpen(v.id);
    if (active) {
      // RULE 4: back inside with tracking still on → notify, auto-stop in 2 min.
      const stopAt = new Date(Date.now() + 2 * 60 * 1000);
      await db.update(vehicles).set({ pendingStopAt: stopAt }).where(eq(vehicles.id, v.id));
      await notify([`driver:${active.driverId}` as Target, "admin", "jco"], {
        title: "TURN OFF TRACKING",
        message: `${v.regNo} is inside MT park. Turn tracking OFF — it will be switched off automatically in 2 minutes.`,
        kind: "alarm",
        vehicleId: v.id,
        tripId: active.tripId,
      });
    } else {
      await notify(["admin", "jco"], {
        title: "Vehicle IN",
        message: `${v.regNo} scanned IN to MT park.`,
        vehicleId: v.id,
      });
    }
  }

  return { event: evt };
}

/* ------------------------------------------------------------- TRIP HOOKS */

/** Called when a driver presses START. */
export async function handleTripStarted(args: { tripId: number; vehicleId: number; driverId: number }) {
  const [v] = await db.select().from(vehicles).where(eq(vehicles.id, args.vehicleId));
  if (!v) return;
  if (v.parkStatus === "out") {
    // Correct behaviour: tracking started for a vehicle that is OUT.
    const closed = await resolveOpen(args.vehicleId, ["tracking_off_out"]);
    if (closed) {
      await notify([`driver:${args.driverId}` as Target, "admin", "jco"], {
        title: "Tracking confirmed",
        message: `${v.regNo} tracking is now ON — thank you. Maintain tracking until you return to MT park.`,
        kind: "info",
        vehicleId: v.id,
        tripId: args.tripId,
      });
    }
  }
  // If still IN, rule 2 is evaluated once the trip is 5 minutes old.
}

/** Called when a driver presses STOP (or tracking is completed). */
export async function handleTripStopped(args: { tripId: number; vehicleId: number; driverId: number }) {
  const [v] = await db.select().from(vehicles).where(eq(vehicles.id, args.vehicleId));
  if (!v) return;
  await db.update(vehicles).set({ pendingStopAt: null }).where(eq(vehicles.id, v.id));
  await resolveOpen(args.vehicleId, ["tracking_on_in"]);

  // RULE 3: tracking stopped while the vehicle is still OUT.
  if (v.parkStatus === "out") {
    const [inc] = await db
      .insert(incidents)
      .values({
        kind: "stopped_out",
        message: `${v.regNo} stopped tracking but is still OUT of MT park.`,
        vehicleId: v.id,
        tripId: args.tripId,
        driverId: args.driverId,
        lastRepeatAt: new Date(),
      })
      .returning();
    const targets: Target[] = ["admin", "jco", `driver:${args.driverId}`];
    await notify(targets, {
      title: "ALARM — stopped while OUT",
      message: inc.message,
      kind: "alarm",
      vehicleId: v.id,
      tripId: args.tripId,
    });
  }
}

/* ----------------------------------------------------------- EVALUATION */

/**
 * Runs every few seconds while a control-room terminal is open.
 * Implements: rule 2 (tracking on while IN after 5 min), rule 3 repeats
 * (every 60 s while OUT), rule 4 (auto-stop 2 min after scanning IN).
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

  // RULE 2: active trip, vehicle still IN, older than 5 minutes.
  const activeTrips = await db
    .select({
      tripId: trips.id,
      driverId: trips.driverId,
      startedAt: trips.startedAt,
      vehicleId: vehicles.id,
      regNo: vehicles.regNo,
      parkStatus: vehicles.parkStatus,
    })
    .from(trips)
    .innerJoin(vehicles, eq(trips.vehicleId, vehicles.id))
    .where(eq(trips.status, "active"));

  for (const t of activeTrips) {
    if (t.parkStatus === "in" && now - t.startedAt.getTime() >= 5 * 60 * 1000) {
      const existing = await db
        .select()
        .from(incidents)
        .where(
          and(
            eq(incidents.vehicleId, t.vehicleId),
            eq(incidents.kind, "tracking_on_in"),
            eq(incidents.resolved, false)
          )
        )
        .limit(1);
      if (existing.length === 0) {
        const msg = `${t.regNo} started tracking over 5 minutes ago but is still inside MT park.`;
        await db.insert(incidents).values({
          kind: "tracking_on_in",
          message: msg,
          vehicleId: t.vehicleId,
          tripId: t.tripId,
          driverId: t.driverId,
        });
        await notify(["admin", "jco", `driver:${t.driverId}`] as Target[], {
          title: "Tracking ON while inside park",
          message: `${msg} If not moving out, turn tracking OFF.`,
          kind: "alarm",
          vehicleId: t.vehicleId,
          tripId: t.tripId,
        });
      }
    }
  }

  // RULE 3 repeats: unresolved "stopped while OUT" → nudge every 60 seconds.
  const openStopped = await db
    .select()
    .from(incidents)
    .where(and(eq(incidents.kind, "stopped_out"), eq(incidents.resolved, false)));

  for (const inc of openStopped) {
    const last = inc.lastRepeatAt ? inc.lastRepeatAt.getTime() : inc.ts.getTime();
    if (now - last >= 60 * 1000) {
      const targets: Target[] = ["admin", "jco"];
      if (inc.driverId) targets.push(`driver:${inc.driverId}`);
      await notify(targets, {
        title: "REPEAT ALARM — still OUT",
        message: `${inc.message} Restart tracking or return to MT park.`,
        kind: "alarm",
        vehicleId: inc.vehicleId,
        tripId: inc.tripId ?? undefined,
      });
      await db
        .update(incidents)
        .set({ lastRepeatAt: new Date() })
        .where(eq(incidents.id, inc.id));
    }
  }

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
