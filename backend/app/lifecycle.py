from app.core.config import DATA_DIR
from app.core.import_targets import seed_import_targets
from app.db import get_connection, init_db, reset_import_data
from app.services.importer import import_sample_files, refresh_policy_documents


def startup() -> None:
    init_db()
    seed_import_targets()
    with get_connection() as conn:
        has_imports = conn.execute("SELECT COUNT(*) AS count FROM import_batches").fetchone()["count"] > 0
        has_versions = conn.execute("SELECT COUNT(*) AS count FROM import_versions").fetchone()["count"] > 0
    if not has_imports and not has_versions:
        reset_import_data()
        import_sample_files(DATA_DIR)
        return
    refresh_policy_documents(DATA_DIR, trigger_ai=False, trigger_type="startup_refresh")
