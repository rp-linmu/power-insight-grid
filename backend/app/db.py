import sqlite3
from contextlib import contextmanager

from app.core.config import DB_PATH


SCHEMA_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS import_batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        category TEXT NOT NULL,
        external_date TEXT,
        detected_sheet_date TEXT,
        effective_date TEXT,
        validation_message TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS disclosure_timeseries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        import_batch_id INTEGER NOT NULL,
        category TEXT NOT NULL,
        market_type TEXT,
        data_topic TEXT NOT NULL,
        object_name TEXT,
        metric_name TEXT NOT NULL,
        point_time TEXT NOT NULL,
        point_index INTEGER NOT NULL,
        value REAL,
        unit TEXT,
        effective_date TEXT NOT NULL,
        source_sheet TEXT NOT NULL,
        FOREIGN KEY(import_batch_id) REFERENCES import_batches(id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS disclosure_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        import_batch_id INTEGER NOT NULL,
        category TEXT NOT NULL,
        source_sheet TEXT NOT NULL,
        row_key TEXT,
        payload_json TEXT NOT NULL,
        effective_date TEXT NOT NULL,
        FOREIGN KEY(import_batch_id) REFERENCES import_batches(id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS disclosure_texts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        import_batch_id INTEGER NOT NULL,
        category TEXT NOT NULL,
        source_sheet TEXT NOT NULL,
        title TEXT,
        content TEXT NOT NULL,
        effective_date TEXT NOT NULL,
        FOREIGN KEY(import_batch_id) REFERENCES import_batches(id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS disclosure_date_catalog (
        metric_name TEXT NOT NULL,
        market_type TEXT NOT NULL DEFAULT '',
        effective_date TEXT NOT NULL,
        PRIMARY KEY (metric_name, market_type, effective_date)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS policy_documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        region TEXT,
        issuer TEXT,
        policy_date TEXT,
        summary TEXT,
        scope_summary TEXT,
        impact_summary TEXT,
        key_points_json TEXT,
        impact_tags_json TEXT,
        subject_impacts_json TEXT,
        formula_items_json TEXT,
        fee_items_json TEXT,
        responsibility_matrix_json TEXT,
        time_nodes_json TEXT,
        risk_points_json TEXT,
        action_suggestions_json TEXT,
        content_text TEXT,
        parsed_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS policy_analysis_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        policy_id INTEGER NOT NULL,
        version_no INTEGER NOT NULL,
        trigger_type TEXT NOT NULL,
        analysis_mode TEXT,
        analysis_model TEXT,
        analysis_profile TEXT,
        analysis_note TEXT,
        analysis_debug_note TEXT,
        summary TEXT,
        scope_summary TEXT,
        impact_summary TEXT,
        key_points_json TEXT,
        impact_tags_json TEXT,
        subject_impacts_json TEXT,
        formula_items_json TEXT,
        fee_items_json TEXT,
        responsibility_matrix_json TEXT,
        time_nodes_json TEXT,
        risk_points_json TEXT,
        action_suggestions_json TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(policy_id) REFERENCES policy_documents(id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS import_target_configs (
        page_key TEXT PRIMARY KEY,
        module_name TEXT NOT NULL,
        page_name TEXT NOT NULL,
        data_type TEXT NOT NULL,
        category TEXT NOT NULL,
        folder_path TEXT NOT NULL,
        expected_files_json TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS import_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        page_key TEXT NOT NULL,
        effective_date TEXT NOT NULL,
        version_name TEXT NOT NULL,
        version_tag TEXT NOT NULL,
        owner TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(page_key) REFERENCES import_target_configs(page_key)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS import_version_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version_id INTEGER NOT NULL,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        category TEXT NOT NULL,
        imported_batches INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(version_id) REFERENCES import_versions(id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        module_permissions_json TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS user_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        session_token TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS grid_nodes (
        node_name TEXT PRIMARY KEY,
        node_type TEXT,
        voltage_level TEXT,
        region TEXT,
        longitude REAL,
        latitude REAL,
        imported_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS grid_lines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        line_name TEXT NOT NULL,
        node_start TEXT NOT NULL,
        node_end TEXT NOT NULL,
        voltage_level TEXT,
        capacity REAL,
        imported_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS grid_channels (
        channel_name TEXT PRIMARY KEY,
        capacity REAL,
        imported_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS grid_node_price_mapping (
        topology_node TEXT NOT NULL,
        price_node_name TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'manual',
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (topology_node, price_node_name)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS topology_analysis_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        effective_date TEXT NOT NULL,
        market_type TEXT NOT NULL,
        line_count INTEGER NOT NULL,
        matched_node_count INTEGER NOT NULL,
        total_node_count INTEGER NOT NULL,
        peak_time TEXT,
        max_abs_spread REAL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (effective_date, market_type)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS topology_line_blockage (
        run_id INTEGER NOT NULL,
        line_name TEXT NOT NULL,
        node_start TEXT NOT NULL,
        node_end TEXT NOT NULL,
        voltage_level TEXT,
        sum_abs_spread REAL,
        max_abs_spread REAL,
        avg_abs_spread REAL,
        peak_time TEXT,
        blocked_points INTEGER,
        start_price_at_peak REAL,
        end_price_at_peak REAL,
        PRIMARY KEY (run_id, line_name, node_start, node_end),
        FOREIGN KEY(run_id) REFERENCES topology_analysis_runs(id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS topology_line_time_spread (
        run_id INTEGER NOT NULL,
        line_name TEXT NOT NULL,
        point_time TEXT NOT NULL,
        point_index INTEGER NOT NULL,
        spread REAL,
        abs_spread REAL,
        is_blocked INTEGER NOT NULL,
        PRIMARY KEY (run_id, line_name, point_index),
        FOREIGN KEY(run_id) REFERENCES topology_analysis_runs(id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS topology_network_payloads (
        run_id INTEGER PRIMARY KEY,
        payload_json TEXT NOT NULL,
        FOREIGN KEY(run_id) REFERENCES topology_analysis_runs(id)
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_disclosure_timeseries_effective_date
    ON disclosure_timeseries (effective_date)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_disclosure_timeseries_lookup
    ON disclosure_timeseries (
        metric_name, market_type, effective_date, data_topic, object_name, point_index
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_disclosure_timeseries_model_export
    ON disclosure_timeseries (
        effective_date, metric_name, market_type, point_index
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_disclosure_records_source_sheet
    ON disclosure_records (source_sheet)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_import_batches_category_date
    ON import_batches (category, effective_date)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_import_batches_file_path
    ON import_batches (file_path)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_grid_lines_nodes
    ON grid_lines (node_start, node_end)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_topology_runs_lookup
    ON topology_analysis_runs (effective_date, market_type)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_topology_line_rank
    ON topology_line_blockage (run_id, sum_abs_spread DESC)
    """,
]

POLICY_EXTRA_COLUMNS = {
    "scope_summary": "TEXT",
    "impact_summary": "TEXT",
    "key_points_json": "TEXT",
    "impact_tags_json": "TEXT",
    "subject_impacts_json": "TEXT",
    "formula_items_json": "TEXT",
    "fee_items_json": "TEXT",
    "responsibility_matrix_json": "TEXT",
    "time_nodes_json": "TEXT",
    "risk_points_json": "TEXT",
    "action_suggestions_json": "TEXT",
    "content_text": "TEXT",
    "parsed_at": "TEXT",
    "analysis_mode": "TEXT",
    "analysis_model": "TEXT",
    "analysis_profile": "TEXT",
    "analysis_note": "TEXT",
    "analysis_debug_note": "TEXT",
    "manual_updated_at": "TEXT",
}

POLICY_VERSION_EXTRA_COLUMNS = {
    "analysis_debug_note": "TEXT",
    "subject_impacts_json": "TEXT",
    "formula_items_json": "TEXT",
    "fee_items_json": "TEXT",
    "responsibility_matrix_json": "TEXT",
    "time_nodes_json": "TEXT",
    "risk_points_json": "TEXT",
    "action_suggestions_json": "TEXT",
}

USER_EXTRA_COLUMNS = {
    "module_permissions_json": "TEXT",
}




@contextmanager
def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 30000")
    conn.execute("PRAGMA cache_size = -65536")
    conn.execute("PRAGMA temp_store = MEMORY")
    conn.execute("PRAGMA mmap_size = 1073741824")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with get_connection() as conn:
        for statement in SCHEMA_STATEMENTS:
            conn.execute(statement)
        existing_columns = {
            row["name"]
            for row in conn.execute("PRAGMA table_info(policy_documents)").fetchall()
        }
        for column_name, column_type in POLICY_EXTRA_COLUMNS.items():
            if column_name in existing_columns:
                continue
            conn.execute(f"ALTER TABLE policy_documents ADD COLUMN {column_name} {column_type}")
        existing_version_columns = {
            row["name"]
            for row in conn.execute("PRAGMA table_info(policy_analysis_versions)").fetchall()
        }
        for column_name, column_type in POLICY_VERSION_EXTRA_COLUMNS.items():
            if column_name in existing_version_columns:
                continue
            conn.execute(f"ALTER TABLE policy_analysis_versions ADD COLUMN {column_name} {column_type}")
        existing_user_columns = {
            row["name"]
            for row in conn.execute("PRAGMA table_info(users)").fetchall()
        }
        for column_name, column_type in USER_EXTRA_COLUMNS.items():
            if column_name in existing_user_columns:
                continue
            conn.execute(f"ALTER TABLE users ADD COLUMN {column_name} {column_type}")
        existing_import_batch_columns = {
            row["name"]
            for row in conn.execute("PRAGMA table_info(import_batches)").fetchall()
        }
        if "is_active" not in existing_import_batch_columns:
            conn.execute("ALTER TABLE import_batches ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1")


def reset_import_data() -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM disclosure_date_catalog")
        conn.execute("DELETE FROM disclosure_timeseries")
        conn.execute("DELETE FROM disclosure_records")
        conn.execute("DELETE FROM disclosure_texts")
        conn.execute("DELETE FROM import_version_files")
        conn.execute("DELETE FROM import_versions")
        conn.execute("DELETE FROM import_batches")
        conn.execute("DELETE FROM policy_documents")
