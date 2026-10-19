import {
  pgTable,
  serial,
  text,
  integer,
  doublePrecision,
  timestamp,
  boolean,
  date,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(), // 'officer' | 'jco' | 'driver'
  serviceNo: text("service_no").notNull().unique(),
  unit: text("unit").notNull(),
  password: text("password").notNull(),
});

export const vehicles = pgTable("vehicles", {
  id: serial("id").primaryKey(),
  regNo: text("reg_no").notNull().unique(),
  type: text("type").notNull(),
  unit: text("unit").notNull(),
  fuelPct: integer("fuel_pct").notNull().default(80),
  mileage: integer("mileage").notNull().default(0),
  maintenanceDue: date("maintenance_due"),
  status: text("status").notNull().default("available"), // available | active | maintenance
  // MT Park gate state
  parkStatus: text("park_status").notNull().default("in"), // in | out
  pendingStopAt: timestamp("pending_stop_at"), // scan-IN with tracking on → auto-stop deadline
});

export const gateEvents = pgTable("gate_events", {
  id: serial("id").primaryKey(),
  vehicleId: integer("vehicle_id")
    .notNull()
    .references(() => vehicles.id),
  direction: text("direction").notNull(), // in | out
  photoUrl: text("photo_url").notNull(),
  plateText: text("plate_text").notNull(), // ANPR reading
  confidence: doublePrecision("confidence").notNull().default(98),
  driverId: integer("driver_id").references(() => users.id),
  ts: timestamp("ts").notNull().defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  target: text("target").notNull(), // admin | jco | driver:<id> | all
  title: text("title").notNull(),
  message: text("message").notNull(),
  kind: text("kind").notNull().default("info"), // info | alarm
  vehicleId: integer("vehicle_id"),
  tripId: integer("trip_id"),
  ts: timestamp("ts").notNull().defaultNow(),
  read: boolean("read").notNull().default(false),
});

export const incidents = pgTable("incidents", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(), // tracking_off_out | tracking_on_in | stopped_out
  message: text("message").notNull(),
  vehicleId: integer("vehicle_id").notNull(),
  tripId: integer("trip_id"),
  driverId: integer("driver_id"),
  ts: timestamp("ts").notNull().defaultNow(),
  lastRepeatAt: timestamp("last_repeat_at"),
  resolved: boolean("resolved").notNull().default(false),
  resolvedAt: timestamp("resolved_at"),
});

export const trips = pgTable("trips", {
  id: serial("id").primaryKey(),
  driverId: integer("driver_id")
    .notNull()
    .references(() => users.id),
  vehicleId: integer("vehicle_id")
    .notNull()
    .references(() => vehicles.id),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
  status: text("status").notNull().default("active"), // active | completed
});

export const positions = pgTable("positions", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id")
    .notNull()
    .references(() => trips.id),
  vehicleId: integer("vehicle_id")
    .notNull()
    .references(() => vehicles.id),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  speed: doublePrecision("speed"),
  heading: doublePrecision("heading"),
  accuracy: doublePrecision("accuracy"),
  ts: timestamp("ts").notNull().defaultNow(),
});

export const checkpoints = pgTable("checkpoints", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id")
    .notNull()
    .references(() => trips.id),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  note: text("note"),
  ts: timestamp("ts").notNull().defaultNow(),
});

export const alerts = pgTable("alerts", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(), // sos | flag | delay | breakdown
  message: text("message").notNull(),
  tripId: integer("trip_id").references(() => trips.id),
  vehicleId: integer("vehicle_id").references(() => vehicles.id),
  driverId: integer("driver_id").references(() => users.id),
  ts: timestamp("ts").notNull().defaultNow(),
  resolved: boolean("resolved").notNull().default(false),
});

export const broadcasts = pgTable("broadcasts", {
  id: serial("id").primaryKey(),
  fromName: text("from_name").notNull(),
  to: text("to").notNull(), // jco | driver | all
  message: text("message").notNull(),
  ts: timestamp("ts").notNull().defaultNow(),
});
