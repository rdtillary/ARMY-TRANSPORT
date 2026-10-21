import {
  pgTable, serial, text, integer, doublePrecision,
  timestamp, boolean, date, customType,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  serviceNo: text("service_no").notNull().unique(),
  unit: text("unit").notNull(),
  password: text("password").notNull(),
  // Driver photo stored as base64 data URL (same pattern as gate photos)
  photoUrl: text("photo_url"),
});

export const vehicles = pgTable("vehicles", {
  id: serial("id").primaryKey(),
  regNo: text("reg_no").notNull().unique(),
  type: text("type").notNull(),
  unit: text("unit").notNull(),
  fuelPct: integer("fuel_pct").notNull().default(80),
  mileage: integer("mileage").notNull().default(0),
  maintenanceDue: date("maintenance_due"),
  status: text("status").notNull().default("available"),
  parkStatus: text("park_status").notNull().default("in"),
  pendingStopAt: timestamp("pending_stop_at"),
});

export const gateEvents = pgTable("gate_events", {
  id: serial("id").primaryKey(),
  vehicleId: integer("vehicle_id").notNull().references(() => vehicles.id),
  direction: text("direction").notNull(),
  photoUrl: text("photo_url").notNull(),
  plateText: text("plate_text").notNull(),
  confidence: doublePrecision("confidence").notNull().default(98),
  driverId: integer("driver_id").references(() => users.id),
  ts: timestamp("ts").notNull().defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  target: text("target").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  kind: text("kind").notNull().default("info"),
  vehicleId: integer("vehicle_id"),
  tripId: integer("trip_id"),
  ts: timestamp("ts").notNull().defaultNow(),
  read: boolean("read").notNull().default(false),
});

export const incidents = pgTable("incidents", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(),
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
  driverId: integer("driver_id").notNull().references(() => users.id),
  vehicleId: integer("vehicle_id").notNull().references(() => vehicles.id),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
  status: text("status").notNull().default("active"),
});

export const positions = pgTable("positions", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").notNull().references(() => trips.id),
  vehicleId: integer("vehicle_id").notNull().references(() => vehicles.id),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  speed: doublePrecision("speed"),
  heading: doublePrecision("heading"),
  accuracy: doublePrecision("accuracy"),
  ts: timestamp("ts").notNull().defaultNow(),
});

export const checkpoints = pgTable("checkpoints", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").notNull().references(() => trips.id),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  note: text("note"),
  ts: timestamp("ts").notNull().defaultNow(),
});

export const alerts = pgTable("alerts", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(),
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
  to: text("to").notNull(),
  message: text("message").notNull(),
  ts: timestamp("ts").notNull().defaultNow(),
});

/** Sentry under-vehicle scans: the uploaded 360° footage + the stitched underside image. */
export const sentryScans = pgTable("sentry_scans", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  uploadedBy: text("uploaded_by").notNull(),
  videoMime: text("video_mime").notNull(),
  videoSize: integer("video_size").notNull(),
  videoData: bytea("video_data").notNull(),
  // Stitched image stored as a base64 data URL (same pattern as gate photos)
  stitchedUrl: text("stitched_url").notNull(),
  frames: integer("frames").notNull().default(0),
  durationSec: doublePrecision("duration_sec").notNull().default(0),
  ts: timestamp("ts").notNull().defaultNow(),
});
