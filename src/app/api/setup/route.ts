const DDL = [
  `create table if not exists users (
    id serial primary key,
    name text not null,
    role text not null,
    service_no text not null unique,
    unit text not null,
    password text not null
  )`,
  `create table if not exists vehicles (
    id serial primary key,
    reg_no text not null unique,
    type text not null,
    unit text not null,
    fuel_pct integer not null default 80,
    mileage integer not null default 0,
    maintenance_due date,
    status text not null default 'available'
  )`,
  `create table if not exists trips (
    id serial primary key,
    driver_id integer not null references users(id),
    vehicle_id integer not null references vehicles(id),
    started_at timestamptz not null default now(),
    ended_at timestamptz,
    status text not null default 'active'
  )`,
  `create table if not exists positions (
    id serial primary key,
    trip_id integer not null references trips(id),
    vehicle_id integer not null references vehicles(id),
    lat double precision not null,
    lng double precision not null,
    speed double precision,
    heading double precision,
    accuracy double precision,
    ts timestamptz not null default now()
  )`,
  `create table if not exists checkpoints (
    id serial primary key,
    trip_id integer not null references trips(id),
    lat double precision,
    lng double precision,
    note text,
    ts timestamptz not null default now()
  )`,
  `create table if not exists alerts (
    id serial primary key,
    kind text not null,
    message text not null,
    trip_id integer references trips(id),
    vehicle_id integer references vehicles(id),
    driver_id integer references users(id),
    ts timestamptz not null default now(),
    resolved boolean not null default false
  )`,
  `create table if not exists broadcasts (
    id serial primary key,
    from_name text not null,
    "to" text not null,
    message text not null,
    ts timestamptz not null default now()
  )`,
  // --- MT Park operations ---
  `alter table vehicles add column if not exists park_status text not null default 'in'`,
  `alter table vehicles add column if not exists pending_stop_at timestamptz`,
  `create table if not exists gate_events (
    id serial primary key,
    vehicle_id integer not null references vehicles(id),
    direction text not null,
    photo_url text not null,
    plate_text text not null,
    confidence double precision not null default 98,
    driver_id integer references users(id),
    ts timestamptz not null default now()
  )`,
  `create table if not exists notifications (
    id serial primary key,
    target text not null,
    title text not null,
    message text not null,
    kind text not null default 'info',
    vehicle_id integer,
    trip_id integer,
    ts timestamptz not null default now(),
    read boolean not null default false
  )`,
  `create table if not exists incidents (
    id serial primary key,
    kind text not null,
    message text not null,
    vehicle_id integer not null references vehicles(id),
    trip_id integer,
    driver_id integer references users(id),
    ts timestamptz not null default now(),
    last_repeat_at timestamptz,
    resolved boolean not null default false,
    resolved_at timestamptz
  )`
];
