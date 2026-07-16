from fastapi import APIRouter, File, Form, Query, UploadFile

from app.schemas import (
    CrawlerBridgeStatusResponse,
    CrawlerBridgeSyncResponse,
    ImportPreviewResponse,
    ImportStatsResponse,
    ImportTargetSummary,
    ImportVersionBoardResponse,
)
from app.services.crawler_bridge import get_crawler_bridge_status, sync_crawler_downloads
from app.services.imports_service import (
    create_import_version,
    delete_import_version,
    get_import_preview,
    get_import_stats,
    get_import_targets,
    get_import_version_board,
    save_import_target,
    upload_import_version_files,
)


router = APIRouter()


@router.get("/api/imports/preview", response_model=ImportPreviewResponse)
def imports_preview(
    category: str | None = Query(None, description="Category filter"),
    effective_date: str | None = Query(None, description="Effective date filter"),
    mismatch_only: bool = Query(False, description="Only show mismatched dates"),
    limit: int = Query(50, ge=1, le=500),
) -> ImportPreviewResponse:
    return get_import_preview(category, effective_date, mismatch_only, limit)


@router.get("/api/imports/stats", response_model=ImportStatsResponse)
def import_stats() -> ImportStatsResponse:
    return get_import_stats()


@router.get("/api/imports/targets", response_model=list[ImportTargetSummary])
def import_targets() -> list[ImportTargetSummary]:
    return get_import_targets()


@router.get("/api/imports/version-board", response_model=ImportVersionBoardResponse)
def import_version_board(
    effective_date: str | None = Query(None, description="Selected business date"),
) -> ImportVersionBoardResponse:
    return get_import_version_board(effective_date)


@router.get("/api/imports/crawler-bridge/status", response_model=CrawlerBridgeStatusResponse)
def crawler_bridge_status() -> CrawlerBridgeStatusResponse:
    return CrawlerBridgeStatusResponse(**get_crawler_bridge_status())


@router.post("/api/imports/crawler-bridge/sync", response_model=CrawlerBridgeSyncResponse)
def sync_crawler_bridge(
    effective_date: str | None = Query(None, description="Only sync one business date"),
) -> CrawlerBridgeSyncResponse:
    return CrawlerBridgeSyncResponse(**sync_crawler_downloads(effective_date))


@router.post("/api/imports/targets/{page_key}")
def update_import_target(
    page_key: str,
    folder_path: str = Form(...),
) -> dict[str, str]:
    return save_import_target(page_key, folder_path)


@router.post("/api/imports/versions")
def create_version(
    page_key: str = Form(...),
    effective_date: str = Form(...),
    version_tag: str = Form("当前版本"),
    owner: str = Form("系统导入"),
) -> dict[str, int]:
    return create_import_version(page_key, effective_date, version_tag, owner)


@router.post("/api/imports/versions/{version_id}/upload")
async def upload_version_files(
    version_id: int,
    files: list[UploadFile] = File(...),
) -> dict[str, int]:
    return await upload_import_version_files(version_id, files)


@router.delete("/api/imports/versions/{version_id}")
def delete_version(version_id: int) -> dict[str, str]:
    return delete_import_version(version_id)
