from typing import Any

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str


class ImportBatchSummary(BaseModel):
    id: int
    file_name: str
    category: str
    external_date: str | None
    detected_sheet_date: str | None
    effective_date: str | None
    validation_message: str


class OverviewMetric(BaseModel):
    title: str
    value: str
    detail: str


class OverviewResponse(BaseModel):
    metrics: list[OverviewMetric]
    import_batches: list[ImportBatchSummary]


class SeriesPoint(BaseModel):
    point_time: str
    value: float | None


class SeriesResponse(BaseModel):
    title: str
    unit: str | None
    market_type: str | None
    effective_date: str
    points: list[SeriesPoint]


class PolicyDocument(BaseModel):
    id: int
    title: str
    issuer: str | None
    region: str | None
    policy_date: str | None
    summary: str | None
    scope_summary: str | None = None
    impact_summary: str | None = None
    key_points: list[str] = []
    impact_tags: list[str] = []
    subject_impacts: list[dict[str, Any]] = []
    formula_items: list[dict[str, Any]] = []
    fee_items: list[dict[str, Any]] = []
    responsibility_matrix: list[dict[str, Any]] = []
    time_nodes: list[dict[str, Any]] = []
    risk_points: list[dict[str, Any]] = []
    action_suggestions: list[dict[str, Any]] = []
    content_preview: str | None = None
    analysis_mode: str | None = None
    analysis_model: str | None = None
    analysis_profile: str | None = None
    analysis_note: str | None = None
    analysis_debug_note: str | None = None
    manual_updated_at: str | None = None
    file_name: str | None = None
    version_count: int = 0


class PolicyAnalysisVersion(BaseModel):
    id: int
    version_no: int
    trigger_type: str
    analysis_mode: str | None = None
    analysis_model: str | None = None
    analysis_profile: str | None = None
    analysis_note: str | None = None
    analysis_debug_note: str | None = None
    created_at: str | None = None


class PolicyAnalysisStatusResponse(BaseModel):
    llm_enabled: bool
    total: int
    llm_count: int
    rule_count: int
    manual_count: int


class PolicyConnectivityTestResponse(BaseModel):
    ok: bool
    category: str
    summary: str
    detail: str | None = None
    model: str | None = None
    base_url: str | None = None
    http_status: int | None = None


class PolicyChatRequest(BaseModel):
    question: str


class PolicyChatMessage(BaseModel):
    role: str
    content: str


class PolicyChatResponse(BaseModel):
    answer: str
    evidence: list[str] = []
    mode: str
    remaining_quota: int | None = None
    related_policies: list[int] = []


class PolicyWorkspaceDocument(BaseModel):
    id: int
    title: str
    analysis_mode: str | None = None
    analysis_note: str | None = None


class PolicyWorkspaceReportResponse(BaseModel):
    policy_ids: list[int]
    mode: str
    report_title: str
    report_text: str
    evidence: list[str] = []
    documents: list[PolicyWorkspaceDocument] = []


class ImportPreviewResponse(BaseModel):
    batches: list[ImportBatchSummary]
    notes: list[str]


class TableRow(BaseModel):
    row_key: str | None
    payload: dict[str, Any]


class RecordQueryResponse(BaseModel):
    rows: list[TableRow]
    total: int
    page: int
    page_size: int


class DisclosureOption(BaseModel):
    metric_names: list[str]
    market_types: list[str]
    record_sheets: list[str]


class ImportStatsResponse(BaseModel):
    total_batches: int
    mismatch_batches: int
    categories: dict[str, int]


class ImportTargetSummary(BaseModel):
    module_name: str
    page_name: str
    page_key: str
    data_type: str
    category: str
    folder_path: str
    expected_files: list[str]
    uploaded_files: int
    missing_files: int
    latest_effective_date: str | None
    latest_uploaded_at: str | None


class ImportVersionRow(BaseModel):
    id: int | None = None
    module_name: str
    page_name: str
    page_key: str | None = None
    data_type: str
    effective_date: str | None
    version_name: str
    version_tag: str
    uploaded_at: str | None
    uploaded_files: int
    missing_files: int
    owner: str
    folder_path: str
    expected_files: list[str] = []
    uploaded_file_names: list[str] = []
    missing_file_names: list[str] = []


class ImportVersionBoardResponse(BaseModel):
    selected_date: str | None
    rows: list[ImportVersionRow]


class CrawlerBridgeStatusResponse(BaseModel):
    ok: bool
    message: str
    source_dir: str
    total_files: int
    pending_files: int
    skipped_files: int
    available_dates: list[str] = []
    latest_date: str | None = None
    preview_files: list[str] = []
    checked_at: str | None = None


class CrawlerBridgeSyncResponse(BaseModel):
    ok: bool
    message: str
    source_dir: str
    synced_files: list[str] = []
    skipped_files: list[str] = []
    failed_files: list[str] = []
    rebuilt_dates: list[str] = []
    cache_cleared: bool = False
    synced_at: str | None = None


class ObjectOptionResponse(BaseModel):
    object_names: list[str]
    regions: list[str] = []


class RankingRow(BaseModel):
    name: str
    value: float | None


class RankingResponse(BaseModel):
    title: str
    unit: str | None
    rows: list[RankingRow]


class DateOptionResponse(BaseModel):
    dates: list[str]


class MarketClearingDayResponse(BaseModel):
    selected_date: str | None = None
    available_dates: list[str] = []
    day_ahead_offer_price: float | None = None
    day_ahead_clearing_price: float | None = None
    day_ahead_clearing_energy: float | None = None
    realtime_clearing_price: float | None = None
    realtime_clearing_energy: float | None = None


class UnitStatusSegment(BaseModel):
    start: str
    end: str
    status: str


class UnitCommitmentRow(BaseModel):
    unit_name: str
    plant_name: str | None = None
    minimum_output_mw: float | None = None
    rated_output_mw: float | None = None
    current_segments: list[UnitStatusSegment] = []
    previous_segments: list[UnitStatusSegment] = []


class UnitCommitmentLinkageResponse(BaseModel):
    selected_date: str | None = None
    previous_date: str | None = None
    current_constraint_mode: str = "missing"
    previous_constraint_mode: str = "missing"
    previous_available: bool = False
    times: list[str] = []
    rows: list[UnitCommitmentRow] = []
    note: str


class TradingDataStatus(BaseModel):
    key: str
    label: str
    status: str = "missing"
    status_label: str = "未发布"
    updated_at: str | None = None


class TradingContextResponse(BaseModel):
    selected_date: str | None = None
    available_dates: list[str] = []
    previous_date: str | None = None
    next_date: str | None = None
    status: str = "missing"
    status_label: str = "暂无数据"
    completeness: int = 0
    updated_at: str | None = None
    missing_items: list[str] = []
    data_statuses: list[TradingDataStatus] = []


class TradingMetricSnapshot(BaseModel):
    key: str
    label: str
    value: float | None = None
    unit: str = "MW"
    detail: str
    delta: float | None = None
    tone: str = "flat"


class TradingRiskItem(BaseModel):
    level: str
    title: str
    detail: str
    source: str


class TradingMoment(BaseModel):
    label: str
    time: str | None = None
    value: float | None = None
    unit: str = "MW"
    detail: str


class TradingPremarketResponse(BaseModel):
    context: TradingContextResponse
    conclusion: str
    risk_level: str
    risk_label: str
    metrics: list[TradingMetricSnapshot] = []
    load_series: list[SeriesPoint] = []
    b_space_series: list[SeriesPoint] = []
    renewable_series: list[SeriesPoint] = []
    reserve_series: list[SeriesPoint] = []
    moments: list[TradingMoment] = []
    risks: list[TradingRiskItem] = []
    constraint_summary: dict[str, float | int | None] = {}
    market_summary: dict[str, float | None] = {}


