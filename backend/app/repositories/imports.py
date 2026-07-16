from app.db import get_connection


def fetch_import_preview_rows(category: str | None, effective_date: str | None, mismatch_only: bool, limit: int) -> list:
    query = """
        SELECT id, file_name, category, external_date, detected_sheet_date,
               effective_date, validation_message
        FROM import_batches
        WHERE is_active = 1
    """
    params: list[object] = []

    if category:
        query += " AND category = ?"
        params.append(category)

    if effective_date:
        query += " AND effective_date = ?"
        params.append(effective_date)

    if mismatch_only:
        query += " AND external_date IS NOT NULL AND detected_sheet_date IS NOT NULL AND external_date != detected_sheet_date"

    query += " ORDER BY id DESC LIMIT ?"
    params.append(limit)

    with get_connection() as conn:
        return conn.execute(query, params).fetchall()


def fetch_import_stats() -> tuple[int, int, list]:
    with get_connection() as conn:
        total_batches = conn.execute(
            "SELECT COUNT(*) AS count FROM import_batches WHERE is_active = 1"
        ).fetchone()["count"]
        mismatch_batches = conn.execute(
            """
            SELECT COUNT(*) AS count
            FROM import_batches
            WHERE is_active = 1
              AND external_date IS NOT NULL
              AND detected_sheet_date IS NOT NULL
              AND external_date != detected_sheet_date
            """
        ).fetchone()["count"]
        category_rows = conn.execute(
            """
            SELECT category, COUNT(*) AS count
            FROM import_batches
            WHERE is_active = 1
            GROUP BY category
            ORDER BY count DESC
            """
        ).fetchall()
    return total_batches, mismatch_batches, category_rows


def fetch_target_version_rows() -> list:
    with get_connection() as conn:
        return conn.execute(
            """
            SELECT v.page_key, v.effective_date, v.created_at AS uploaded_at,
                   COUNT(f.id) AS uploaded_files
            FROM import_versions v
            LEFT JOIN import_version_files f ON f.version_id = v.id
            GROUP BY v.id
            ORDER BY v.created_at DESC, v.id DESC
            """
        ).fetchall()


def fetch_version_board_rows(effective_date: str | None = None) -> list:
    with get_connection() as conn:
        return conn.execute(
            """
            SELECT v.id, v.page_key, v.effective_date, v.version_name, v.version_tag, v.owner, v.created_at,
                   COUNT(f.id) AS uploaded_files, COALESCE(SUM(f.imported_batches), 0) AS imported_batches,
                   GROUP_CONCAT(f.file_name, '||') AS file_names
            FROM import_versions v
            LEFT JOIN import_version_files f ON f.version_id = v.id
            WHERE v.effective_date = COALESCE(
                ?,
                (SELECT MAX(latest.effective_date) FROM import_versions latest)
            )
            GROUP BY v.id
            ORDER BY v.created_at DESC, v.id DESC
            """,
            (effective_date,),
        ).fetchall()


def update_import_target_folder(page_key: str, folder_path: str) -> None:
    with get_connection() as conn:
        exists = conn.execute("SELECT page_key FROM import_target_configs WHERE page_key = ?", (page_key,)).fetchone()
        if not exists:
            raise LookupError(page_key)
        conn.execute(
            "UPDATE import_target_configs SET folder_path = ? WHERE page_key = ?",
            (folder_path.strip(), page_key),
        )


def create_import_version_record(page_key: str, effective_date: str, version_name: str, version_tag: str, owner: str) -> int:
    with get_connection() as conn:
        target = conn.execute(
            "SELECT page_key FROM import_target_configs WHERE page_key = ?",
            (page_key,),
        ).fetchone()
        if not target:
            raise LookupError(page_key)

        cursor = conn.execute(
            """
            INSERT INTO import_versions (page_key, effective_date, version_name, version_tag, owner)
            VALUES (?, ?, ?, ?, ?)
            """,
            (page_key, effective_date, version_name, version_tag, owner),
        )
        return int(cursor.lastrowid)


def fetch_upload_version(version_id: int):
    with get_connection() as conn:
        return conn.execute(
            """
            SELECT v.id, v.page_key, v.effective_date, t.category, t.folder_path
            FROM import_versions v
            JOIN import_target_configs t ON t.page_key = v.page_key
            WHERE v.id = ?
            """,
            (version_id,),
        ).fetchone()


def insert_version_file(version_id: int, file_name: str, file_path: str, category: str, imported_batches: int) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO import_version_files (version_id, file_name, file_path, category, imported_batches)
            VALUES (?, ?, ?, ?, ?)
            """,
            (version_id, file_name, file_path, category, imported_batches),
        )


def count_import_batches_for_file(file_path: str) -> int:
    with get_connection() as conn:
        return conn.execute(
            "SELECT COUNT(*) AS count FROM import_batches WHERE file_path = ? AND is_active = 1",
            (file_path,),
        ).fetchone()["count"]


def delete_version_data(version_id: int) -> list[str]:
    with get_connection() as conn:
        file_rows = conn.execute(
            "SELECT file_path FROM import_version_files WHERE version_id = ?",
            (version_id,),
        ).fetchall()
        file_paths = [row["file_path"] for row in file_rows]

        if file_paths:
            placeholders = ",".join("?" for _ in file_paths)
            batch_rows = conn.execute(
                f"SELECT id FROM import_batches WHERE file_path IN ({placeholders})",
                file_paths,
            ).fetchall()
            batch_ids = [row["id"] for row in batch_rows]
            if batch_ids:
                batch_placeholders = ",".join("?" for _ in batch_ids)
                conn.execute(
                    f"UPDATE import_batches SET is_active = 0 WHERE id IN ({batch_placeholders})",
                    batch_ids,
                )

            conn.execute(f"DELETE FROM policy_documents WHERE file_path IN ({placeholders})", file_paths)
            conn.execute("DELETE FROM import_version_files WHERE version_id = ?", (version_id,))

        conn.execute("DELETE FROM import_versions WHERE id = ?", (version_id,))

    return file_paths
