-- Daily log metrics per service. Add rows here (or via a later migration)
-- to start capturing a new measurement; no schema change is needed.
insert into metrics (code, service, name, unit, aggregation, sort_order) values
  -- Electricity (powerhouse daily log)
  ('gross_generation_kwh', 'electricity', 'Gross generation',       'kWh',  'sum',  10),
  ('aux_consumption_kwh',  'electricity', 'Auxiliary consumption',  'kWh',  'sum',  20),
  ('solar_generation_kwh', 'electricity', 'Solar generation',       'kWh',  'sum',  30),
  ('peak_load_kw',         'electricity', 'Peak load',              'kW',   'max',  40),
  ('fuel_consumed_l',      'electricity', 'Fuel consumed',          'L',    'sum',  50),
  ('fuel_received_l',      'electricity', 'Fuel received',          'L',    'sum',  60),
  ('fuel_stock_l',         'electricity', 'Fuel stock (end of day)', 'L',   'last', 70),
  ('lube_oil_consumed_l',  'electricity', 'Lube oil consumed',      'L',    'sum',  80),
  ('outage_minutes',       'electricity', 'Supply interruption',    'min',  'sum',  90),
  -- Water (RO plant daily log)
  ('water_produced_m3',    'water',       'Water produced',         'm³',   'sum',  10),
  ('water_supplied_m3',    'water',       'Water supplied',         'm³',   'sum',  20),
  ('water_storage_m3',     'water',       'Water in storage (end of day)', 'm³', 'last', 30),
  ('water_energy_kwh',     'water',       'Energy used',            'kWh',  'sum',  40),
  ('water_tds_ppm',        'water',       'Product water TDS',      'ppm',  'avg',  50),
  ('chlorine_residual_mgl','water',       'Chlorine residual',      'mg/L', 'avg',  60),
  ('water_outage_minutes', 'water',       'Supply interruption',    'min',  'sum',  70),
  -- Sewerage (treatment plant / pump station daily log)
  ('sewage_pumped_m3',     'sewerage',    'Sewage pumped',          'm³',   'sum',  10),
  ('sewage_treated_m3',    'sewerage',    'Sewage treated',         'm³',   'sum',  20),
  ('sewer_energy_kwh',     'sewerage',    'Energy used',            'kWh',  'sum',  30),
  ('pump_runtime_h',       'sewerage',    'Pump run time',          'h',    'sum',  40),
  ('blockages_cleared',    'sewerage',    'Blockages cleared',      'count','sum',  50),
  ('overflow_events',      'sewerage',    'Overflow events',        'count','sum',  60);
