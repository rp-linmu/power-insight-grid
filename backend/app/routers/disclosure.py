from fastapi import APIRouter, Query

from app.schemas import (
    DateOptionResponse,
    DisclosureOption,
    MarketClearingDayResponse,
    ObjectOptionResponse,
    RankingResponse,
    RecordQueryResponse,
    SeriesResponse,
    TableRow,
    UnitCommitmentLinkageResponse,
)
from app.services.disclosure_service import (
    get_dates,
    get_market_clearing_day,
    get_objects,
    get_options,
    get_ranking,
    get_records,
    get_records_query,
    get_series,
    get_unit_commitment_linkage,
)


router = APIRouter()


@router.get("/api/disclosure/series", response_model=SeriesResponse)
def disclosure_series(
    metric_name: str = Query(..., description="Metric name"),
    market_type: str | None = Query(None, description="Market type"),
    effective_date: str | None = Query(None, description="Business date in YYYY-MM-DD"),
    date_from: str | None = Query(None, description="Start date in YYYY-MM-DD"),
    date_to: str | None = Query(None, description="End date in YYYY-MM-DD"),
    object_name: str | None = Query(None, description="Object name"),
    data_topic: str | None = Query(None, description="Data topic"),
    limit: int = Query(96, ge=1, le=5000),
) -> SeriesResponse:
    return get_series(metric_name, market_type, effective_date, date_from, date_to, object_name, data_topic, limit)


@router.get("/api/disclosure/records", response_model=list[TableRow])
def disclosure_records(sheet_name: str = Query(..., description="Sheet name keyword")) -> list[TableRow]:
    return get_records(sheet_name)


@router.get("/api/disclosure/records/query", response_model=RecordQueryResponse)
def disclosure_records_query(
    sheet_name: str = Query(..., description="Sheet name keyword"),
    search_field: str | None = Query(None, description="First field"),
    search_value: str | None = Query(None, description="First keyword"),
    search_field_2: str | None = Query(None, description="Second field"),
    search_value_2: str | None = Query(None, description="Second keyword"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> RecordQueryResponse:
    return get_records_query(sheet_name, search_field, search_value, search_field_2, search_value_2, page, page_size)


@router.get("/api/disclosure/options", response_model=DisclosureOption)
def disclosure_options() -> DisclosureOption:
    return get_options()


@router.get("/api/disclosure/dates", response_model=DateOptionResponse)
def disclosure_dates(
    metric_name: str | None = Query(None, description="Metric name"),
    market_type: str | None = Query(None, description="Market type"),
) -> DateOptionResponse:
    return get_dates(metric_name, market_type)


@router.get("/api/disclosure/market-clearing", response_model=MarketClearingDayResponse)
def disclosure_market_clearing(
    effective_date: str | None = Query(None, description="Business date"),
) -> MarketClearingDayResponse:
    return get_market_clearing_day(effective_date)


@router.get("/api/disclosure/unit-commitment-linkage", response_model=UnitCommitmentLinkageResponse)
def disclosure_unit_commitment_linkage(
    effective_date: str | None = Query(None, description="Day-ahead business date"),
) -> UnitCommitmentLinkageResponse:
    return get_unit_commitment_linkage(effective_date)


@router.get("/api/disclosure/objects", response_model=ObjectOptionResponse)
def disclosure_objects(
    metric_name: str = Query(..., description="Metric name"),
    market_type: str | None = Query(None, description="Market type"),
    data_topic: str | None = Query(None, description="Data topic"),
    effective_date: str | None = Query(None, description="Business date"),
    search: str | None = Query(None, description="Search keyword"),
    region: str | None = Query(None, description="Region label"),
) -> ObjectOptionResponse:
    return get_objects(metric_name, market_type, data_topic, effective_date, search, region)


@router.get("/api/disclosure/ranking", response_model=RankingResponse)
def disclosure_ranking(
    metric_name: str = Query(..., description="Metric name"),
    market_type: str | None = Query(None, description="Market type"),
    data_topic: str | None = Query(None, description="Data topic"),
    effective_date: str | None = Query(None, description="Business date"),
    top_n: int = Query(10, ge=1, le=50),
    ascending: bool = Query(False, description="Ascending order"),
    region: str | None = Query(None, description="Region label"),
    search: str | None = Query(None, description="Search keyword"),
) -> RankingResponse:
    return get_ranking(metric_name, market_type, data_topic, effective_date, top_n, ascending, region, search)
