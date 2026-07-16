from fastapi import APIRouter, Body, HTTPException, Query

from app.services.topology_service import get_result, get_status, import_model, run_analysis


router = APIRouter(prefix="/api/topology", tags=["topology"])


@router.get("/status")
def status() -> dict[str, object]:
    return get_status()


@router.post("/import-grid-model")
def import_grid_model(payload: dict[str, object] = Body(...)) -> dict[str, object]:
    try:
        return import_model(str(payload.get("source_path") or ""))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/run")
def run(
    effective_date: str = Query(...),
    market_type: str = Query("实时"),
) -> dict[str, object]:
    try:
        return run_analysis(effective_date, market_type)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/result")
def result(
    effective_date: str = Query(...),
    market_type: str = Query("实时"),
    run_if_missing: bool = Query(True),
    point_time: str | None = Query(None),
) -> dict[str, object]:
    try:
        return get_result(effective_date, market_type, run_if_missing=run_if_missing, point_time=point_time)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
