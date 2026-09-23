-- MCTE Transport — seed data
-- Apply with:  psql "$DATABASE_URL" -f scripts/seed.sql
-- The ONLY built-in login is the central control room administrator:
--   id = ADMIN   password = admin
-- All JCO and Driver accounts are created from the Admin terminal
-- (Personnel & Fleet Administration panel).

INSERT INTO users (name, role, service_no, unit, password) VALUES
  ('Control Room Admin', 'officer', 'ADMIN', 'Central Control Room', 'admin')
ON CONFLICT (service_no) DO UPDATE
  SET password = EXCLUDED.password, role = 'officer', unit = 'Central Control Room';

-- Remove any legacy demo accounts if this script is re-run.
DELETE FROM positions WHERE trip_id IN (
  SELECT t.id FROM trips t JOIN users u ON t.driver_id = u.id
  WHERE u.service_no IN ('OFC-1001','JCO-2002','DRV-3003','DRV-3004'));
DELETE FROM checkpoints WHERE trip_id IN (
  SELECT t.id FROM trips t JOIN users u ON t.driver_id = u.id
  WHERE u.service_no IN ('OFC-1001','JCO-2002','DRV-3003','DRV-3004'));
DELETE FROM alerts WHERE trip_id IN (
  SELECT t.id FROM trips t JOIN users u ON t.driver_id = u.id
  WHERE u.service_no IN ('OFC-1001','JCO-2002','DRV-3003','DRV-3004'))
   OR driver_id IN (SELECT id FROM users WHERE service_no IN ('OFC-1001','JCO-2002','DRV-3003','DRV-3004'));
DELETE FROM trips WHERE driver_id IN (
  SELECT id FROM users WHERE service_no IN ('OFC-1001','JCO-2002','DRV-3003','DRV-3004'));
DELETE FROM users WHERE service_no IN ('OFC-1001','JCO-2002','DRV-3003','DRV-3004');

-- Starting fleet register (editable/deletable from the Admin terminal).
INSERT INTO vehicles (reg_no, type, unit, fuel_pct, mileage, maintenance_due, status) VALUES
  ('0012 AB 3456', 'Scout Car (Mahindra)', '7th Armoured',    82, 12450, '2026-03-15', 'available'),
  ('0045 KJ 2231', 'Truck 5T (Tata)',      '7th Armoured',    67, 48210, '2026-02-28', 'available'),
  ('0912 PL 7788', 'Armoured Carrier',     '12th Mechanised', 91, 22100, '2026-04-10', 'available'),
  ('0301 GH 4567', 'Ambulance (Force)',    '3rd Cavalry',     55, 30980, '2026-02-20', 'available'),
  ('0672 LM 8901', 'Fuel Tanker',          '7th Armoured',    74, 61020, '2026-03-05', 'available'),
  ('0128 ZQ 3344', 'Comms Vehicle',        'Signal Corps',    88, 15600, '2026-05-01', 'maintenance')
ON CONFLICT (reg_no) DO NOTHING;
