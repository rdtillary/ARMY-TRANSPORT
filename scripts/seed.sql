-- Army Transport CMS — demo seed data
-- Apply with:  psql "$DATABASE_URL" -f scripts/seed.sql

INSERT INTO users (name, role, service_no, unit, password) VALUES
  ('Col. A. Verma',   'officer', 'OFC-1001', 'HQ 7th Armoured', 'army123'),
  ('WO R. Iyer',      'jco',     'JCO-2002', '7th Armoured',    'army123'),
  ('Sgt D. Rathore',  'driver',  'DRV-3003', '7th Armoured',    'army123'),
  ('Cpl K. Nair',     'driver',  'DRV-3004', '12th Mechanised', 'army123')
ON CONFLICT (service_no) DO NOTHING;

INSERT INTO vehicles (reg_no, type, unit, fuel_pct, mileage, maintenance_due, status) VALUES
  ('0012 AB 3456', 'Scout Car (Mahindra)', '7th Armoured',    82, 12450, '2026-03-15', 'available'),
  ('0045 KJ 2231', 'Truck 5T (Tata)',      '7th Armoured',    67, 48210, '2026-02-28', 'available'),
  ('0912 PL 7788', 'Armoured Carrier',     '12th Mechanised', 91, 22100, '2026-04-10', 'available'),
  ('0301 GH 4567', 'Ambulance (Force)',    '3rd Cavalry',     55, 30980, '2026-02-20', 'available'),
  ('0672 LM 8901', 'Fuel Tanker',          '7th Armoured',    74, 61020, '2026-03-05', 'available'),
  ('0128 ZQ 3344', 'Comms Vehicle',        'Signal Corps',    88, 15600, '2026-05-01', 'maintenance')
ON CONFLICT (reg_no) DO NOTHING;
