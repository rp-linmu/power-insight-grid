from fastapi import APIRouter

from app.schemas import HealthResponse, OverviewResponse
from app.services.system_service import get_overview


router = APIRouter()


@router.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")


@router.get("/api/overview", response_model=OverviewResponse)
def overview() -> OverviewResponse:
    return get_overview()
