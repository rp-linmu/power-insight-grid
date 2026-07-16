CREATE TABLE IF NOT EXISTS raw_import_files (
    id BIGSERIAL PRIMARY KEY,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_hash TEXT,
    data_domain TEXT NOT NULL,
    market_stage TEXT,
    data_kind TEXT,
    trade_date DATE,
    source_folder TEXT,
    sheet_count INTEGER,
    row_count INTEGER,
    import_status TEXT NOT NULL DEFAULT 'pending',
    error_message TEXT,
    imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (file_path, file_hash)
);

CREATE TABLE IF NOT EXISTS dim_time_slot (
    slot_index SMALLINT PRIMARY KEY,
    slot_time TIME NOT NULL UNIQUE,
    slot_label TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dim_node (
    id BIGSERIAL PRIMARY KEY,
    node_name TEXT NOT NULL UNIQUE,
    region TEXT,
    voltage_level TEXT,
    node_type TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dim_plant (
    id BIGSERIAL PRIMARY KEY,
    plant_name TEXT NOT NULL UNIQUE,
    region TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dim_unit (
    id BIGSERIAL PRIMARY KEY,
    plant_id BIGINT REFERENCES dim_plant(id),
    plant_name TEXT,
    unit_name TEXT NOT NULL,
    unit_type TEXT,
    rated_capacity_mw NUMERIC(14,4),
    min_output_mw NUMERIC(14,4),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (plant_name, unit_name)
);

CREATE TABLE IF NOT EXISTS dim_section (
    id BIGSERIAL PRIMARY KEY,
    section_name TEXT NOT NULL UNIQUE,
    section_type TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clearing_node_prices (
    id BIGSERIAL PRIMARY KEY,
    trade_date DATE NOT NULL,
    slot_index SMALLINT NOT NULL REFERENCES dim_time_slot(slot_index),
    market_stage TEXT NOT NULL,
    node_id BIGINT REFERENCES dim_node(id),
    node_name TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    price NUMERIC(14,4),
    unit TEXT DEFAULT '元/MWh',
    source_file_id BIGINT REFERENCES raw_import_files(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (trade_date, slot_index, market_stage, node_name, metric_name)
);

CREATE TABLE IF NOT EXISTS boundary_records (
    id BIGSERIAL PRIMARY KEY,
    trade_date DATE,
    market_stage TEXT,
    data_kind TEXT,
    topic TEXT NOT NULL,
    source_sheet TEXT NOT NULL,
    row_key TEXT,
    payload_json JSONB NOT NULL,
    source_file_id BIGINT REFERENCES raw_import_files(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS unit_maintenance_events (
    id BIGSERIAL PRIMARY KEY,
    trade_date DATE,
    market_stage TEXT,
    data_kind TEXT,
    plant_name TEXT,
    unit_name TEXT,
    status_type TEXT,
    reason TEXT,
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    source_sheet TEXT,
    source_file_id BIGINT REFERENCES raw_import_files(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS grid_maintenance_events (
    id BIGSERIAL PRIMARY KEY,
    trade_date DATE,
    market_stage TEXT,
    data_kind TEXT,
    component_name TEXT NOT NULL,
    voltage_level TEXT,
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    source_sheet TEXT,
    source_file_id BIGINT REFERENCES raw_import_files(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS must_run_stop_capacity (
    id BIGSERIAL PRIMARY KEY,
    trade_date DATE NOT NULL,
    market_stage TEXT,
    data_kind TEXT,
    capacity_type TEXT,
    must_run_capacity_mw NUMERIC(14,4),
    must_stop_capacity_mw NUMERIC(14,4),
    source_sheet TEXT,
    source_file_id BIGINT REFERENCES raw_import_files(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (trade_date, market_stage, data_kind, capacity_type)
);

CREATE TABLE IF NOT EXISTS unit_output_limits (
    id BIGSERIAL PRIMARY KEY,
    trade_date DATE NOT NULL,
    market_stage TEXT,
    data_kind TEXT,
    plant_name TEXT,
    unit_name TEXT NOT NULL,
    min_technical_output_mw NUMERIC(14,4),
    rated_output_mw NUMERIC(14,4),
    source_sheet TEXT,
    source_file_id BIGINT REFERENCES raw_import_files(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (trade_date, market_stage, data_kind, plant_name, unit_name)
);

CREATE TABLE IF NOT EXISTS manual_security_controls (
    id BIGSERIAL PRIMARY KEY,
    trade_date DATE,
    intervention_device TEXT,
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    clearing_output_range TEXT,
    adjusted_output_range TEXT,
    operator_name TEXT,
    reason TEXT,
    source_sheet TEXT,
    source_file_id BIGINT REFERENCES raw_import_files(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS equipment_commission_retirement (
    id BIGSERIAL PRIMARY KEY,
    trade_date DATE,
    market_stage TEXT,
    data_kind TEXT,
    equipment_name TEXT,
    commission_date DATE,
    retirement_date DATE,
    source_sheet TEXT,
    source_file_id BIGINT REFERENCES raw_import_files(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS line_outage_records (
    id BIGSERIAL PRIMARY KEY,
    trade_date DATE,
    market_stage TEXT,
    data_kind TEXT,
    content TEXT,
    source_sheet TEXT,
    source_file_id BIGINT REFERENCES raw_import_files(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS blocking_records (
    id BIGSERIAL PRIMARY KEY,
    trade_date DATE,
    market_stage TEXT,
    data_kind TEXT,
    block_date DATE,
    block_info TEXT,
    source_sheet TEXT,
    source_file_id BIGINT REFERENCES raw_import_files(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS storage_unit_mode_records (
    id BIGSERIAL PRIMARY KEY,
    trade_date DATE,
    market_stage TEXT,
    data_kind TEXT,
    run_date DATE,
    plant_name TEXT,
    unit_name TEXT,
    bid_mode TEXT,
    source_sheet TEXT,
    source_file_id BIGINT REFERENCES raw_import_files(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS boundary_load_timeseries (
    id BIGSERIAL PRIMARY KEY,
    trade_date DATE NOT NULL,
    slot_index SMALLINT NOT NULL REFERENCES dim_time_slot(slot_index),
    market_stage TEXT NOT NULL,
    data_kind TEXT NOT NULL,
    topic TEXT NOT NULL,
    source_sheet TEXT NOT NULL,
    object_type TEXT,
    object_name TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    source_row_index INTEGER,
    value NUMERIC(16,4),
    unit TEXT,
    source_file_id BIGINT REFERENCES raw_import_files(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (trade_date, slot_index, market_stage, data_kind, source_sheet, source_row_index, object_name, metric_name)
);

CREATE TABLE IF NOT EXISTS boundary_local_power_timeseries (LIKE boundary_load_timeseries INCLUDING ALL);
CREATE TABLE IF NOT EXISTS boundary_west_to_east_timeseries (LIKE boundary_load_timeseries INCLUDING ALL);
CREATE TABLE IF NOT EXISTS boundary_reserve_timeseries (LIKE boundary_load_timeseries INCLUDING ALL);
CREATE TABLE IF NOT EXISTS boundary_section_flow_timeseries (LIKE boundary_load_timeseries INCLUDING ALL);
CREATE TABLE IF NOT EXISTS boundary_generation_total_timeseries (LIKE boundary_load_timeseries INCLUDING ALL);
CREATE TABLE IF NOT EXISTS boundary_new_energy_timeseries (LIKE boundary_load_timeseries INCLUDING ALL);
CREATE TABLE IF NOT EXISTS boundary_hydro_pumped_timeseries (LIKE boundary_load_timeseries INCLUDING ALL);
CREATE TABLE IF NOT EXISTS boundary_unit_output_timeseries (LIKE boundary_load_timeseries INCLUDING ALL);
CREATE TABLE IF NOT EXISTS boundary_node_clearing_timeseries (LIKE boundary_load_timeseries INCLUDING ALL);
CREATE TABLE IF NOT EXISTS boundary_unit_clearing_timeseries (LIKE boundary_load_timeseries INCLUDING ALL);
CREATE TABLE IF NOT EXISTS boundary_unit_constraint_timeseries (LIKE boundary_load_timeseries INCLUDING ALL);
CREATE TABLE IF NOT EXISTS boundary_other_timeseries (LIKE boundary_load_timeseries INCLUDING ALL);

INSERT INTO dim_time_slot (slot_index, slot_time, slot_label)
SELECT
    slot_index,
    (time '00:00' + (slot_index * interval '15 minutes'))::time,
    to_char(time '00:00' + (slot_index * interval '15 minutes'), 'HH24:MI')
FROM generate_series(0, 95) AS slot_index
ON CONFLICT (slot_index) DO UPDATE
SET slot_time = EXCLUDED.slot_time,
    slot_label = EXCLUDED.slot_label;

CREATE INDEX IF NOT EXISTS idx_clearing_prices_date_stage_node
ON clearing_node_prices (trade_date, market_stage, node_name);

CREATE INDEX IF NOT EXISTS idx_clearing_prices_date_slot
ON clearing_node_prices (trade_date, slot_index);

CREATE INDEX IF NOT EXISTS idx_clearing_stage_node_date_slot
ON clearing_node_prices (market_stage, node_name, trade_date, slot_index);

CREATE INDEX IF NOT EXISTS idx_boundary_records_date_topic
ON boundary_records (trade_date, topic);

CREATE INDEX IF NOT EXISTS idx_unit_maintenance_time
ON unit_maintenance_events (start_time, end_time);

CREATE INDEX IF NOT EXISTS idx_grid_maintenance_date
ON grid_maintenance_events (trade_date, component_name);

CREATE INDEX IF NOT EXISTS idx_boundary_load_date_metric
ON boundary_load_timeseries (trade_date, market_stage, data_kind, metric_name, slot_index);

CREATE INDEX IF NOT EXISTS idx_boundary_local_power_date_metric
ON boundary_local_power_timeseries (trade_date, market_stage, data_kind, metric_name, slot_index);

CREATE INDEX IF NOT EXISTS idx_boundary_west_to_east_date_object
ON boundary_west_to_east_timeseries (trade_date, market_stage, data_kind, object_name, slot_index);

CREATE INDEX IF NOT EXISTS idx_boundary_reserve_date_metric
ON boundary_reserve_timeseries (trade_date, market_stage, data_kind, metric_name, slot_index);

CREATE INDEX IF NOT EXISTS idx_boundary_section_date_object
ON boundary_section_flow_timeseries (trade_date, market_stage, data_kind, object_name, slot_index);

CREATE INDEX IF NOT EXISTS idx_boundary_node_clearing_date_object
ON boundary_node_clearing_timeseries (trade_date, market_stage, data_kind, object_name, slot_index);

CREATE INDEX IF NOT EXISTS idx_boundary_unit_clearing_date_object
ON boundary_unit_clearing_timeseries (trade_date, market_stage, data_kind, object_name, slot_index);

CREATE OR REPLACE VIEW v_node_price_spread AS
SELECT
    rt.trade_date,
    rt.slot_index,
    ts.slot_time,
    rt.node_name,
    da.price AS day_ahead_price,
    rt.price AS realtime_price,
    rt.price - da.price AS price_spread
FROM clearing_node_prices rt
JOIN clearing_node_prices da
    ON rt.trade_date = da.trade_date
   AND rt.slot_index = da.slot_index
   AND rt.node_name = da.node_name
JOIN dim_time_slot ts
    ON rt.slot_index = ts.slot_index
WHERE rt.market_stage = 'realtime'
  AND da.market_stage = 'day_ahead';

CREATE OR REPLACE VIEW v_province_price_curve AS
SELECT
    p.trade_date,
    p.market_stage,
    p.slot_index,
    ts.slot_time,
    p.price
FROM clearing_node_prices p
JOIN dim_time_slot ts
    ON p.slot_index = ts.slot_index
WHERE p.node_name = '全省';

CREATE OR REPLACE VIEW v_boundary_load_power AS
SELECT
    b.trade_date,
    b.market_stage,
    b.data_kind,
    b.slot_index,
    ts.slot_time,
    b.object_name,
    b.metric_name,
    b.value,
    b.unit
FROM boundary_load_timeseries b
JOIN dim_time_slot ts
    ON b.slot_index = ts.slot_index
UNION ALL
SELECT
    b.trade_date,
    b.market_stage,
    b.data_kind,
    b.slot_index,
    ts.slot_time,
    b.object_name,
    b.metric_name,
    b.value,
    b.unit
FROM boundary_local_power_timeseries b
JOIN dim_time_slot ts
    ON b.slot_index = ts.slot_index
UNION ALL
SELECT
    b.trade_date,
    b.market_stage,
    b.data_kind,
    b.slot_index,
    ts.slot_time,
    b.object_name,
    b.metric_name,
    b.value,
    b.unit
FROM boundary_west_to_east_timeseries b
JOIN dim_time_slot ts
    ON b.slot_index = ts.slot_index
UNION ALL
SELECT
    b.trade_date,
    b.market_stage,
    b.data_kind,
    b.slot_index,
    ts.slot_time,
    b.object_name,
    b.metric_name,
    b.value,
    b.unit
FROM boundary_reserve_timeseries b
JOIN dim_time_slot ts
    ON b.slot_index = ts.slot_index;
