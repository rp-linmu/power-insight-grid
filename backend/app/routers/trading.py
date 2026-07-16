from fastapi import APIRouter, Query

from app.schemas import TradingContextResponse, TradingPremarketResponse
from app.services.trading_service import get_premarket_dashboard, get_trading_context


router = APIRouter()


@router.get("/api/trading/context", response_model=TradingContextResponse)
def trading_context(
    effective_date: str | None = Query(None, description="Trading date in YYYY-MM-DD"),
) -> TradingContextResponse:
    return get_trading_context(effective_date)


@router.get("/api/trading/premarket", response_model=TradingPremarketResponse)
def trading_premarket(
    effective_date: str | None = Query(None, description="Trading date in YYYY-MM-DD"),
) -> TradingPremarketResponse:
    return get_premarket_dashboard(effective_date)
