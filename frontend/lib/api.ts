type FetchOptions = {
  fallback: any;
  includeSession?: boolean;
};

const API_BASE = process.env.API_BASE_URL || "http://127.0.0.1:8001";

async function fetchJson<T>(path: string, options: FetchOptions): Promise<T> {
  try {
    const response = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
    if (!response.ok) {
      return options.fallback as T;
    }
    return (await response.json()) as T;
  } catch {
    return options.fallback as T;
  }
}

export type OverviewResponse = {
  metrics: { title: string; value: string; detail: string }[];
  import_batches: {
    id: number;
    file_name: string;
    category: string;
    external_date: string | null;
    detected_sheet_date: string | null;
    effective_date: string | null;
    validation_message: string;
  }[];
};

export type SeriesResponse = {
  title: string;
  unit: string | null;
  market_type: string | null;
  effective_date: string;
  points: { point_time: string; value: number | null }[];
};

export type PolicyDocument = {
  id: number;
  title: string;
  issuer: string | null;
  region: string | null;
  policy_date: string | null;
  summary: string | null;
  scope_summary: string | null;
  impact_summary: string | null;
  key_points: string[];
  impact_tags: string[];
  subject_impacts: Record<string, string>[];
  formula_items: Record<string, string>[];
  fee_items: Record<string, string>[];
  responsibility_matrix: Record<string, string>[];
  time_nodes: Record<string, string>[];
  risk_points: Record<string, string>[];
  action_suggestions: Record<string, string>[];
  content_preview: string | null;
  analysis_mode: string | null;
  analysis_model: string | null;
  analysis_profile: string | null;
  analysis_note: string | null;
  analysis_debug_note: string | null;
  manual_updated_at: string | null;
  file_name?: string | null;
  version_count?: number;
};

export type PolicyAnalysisVersion = {
  id: number;
  version_no: number;
  trigger_type: string;
  analysis_mode: string | null;
  analysis_model: string | null;
  analysis_profile: string | null;
  analysis_note: string | null;
  analysis_debug_note: string | null;
  created_at: string | null;
};

export type PolicyAnalysisStatus = {
  llm_enabled: boolean;
  total: number;
  llm_count: number;
  rule_count: number;
  manual_count: number;
};

export type PolicyConnectivityTest = {
  ok: boolean;
  category: string;
  summary: string;
  detail: string | null;
  model: string | null;
  base_url: string | null;
  http_status: number | null;
};

export type ImportPreviewResponse = {
  batches: {
    id: number;
    file_name: string;
    category: string;
    external_date: string | null;
    detected_sheet_date: string | null;
    effective_date: string | null;
    validation_message: string;
  }[];
  notes: string[];
};

export type TableRow = {
  row_key: string | null;
  payload: Record<string, string>;
};

export type RecordQueryResponse = {
  rows: TableRow[];
  total: number;
  page: number;
  page_size: number;
};

export type DisclosureOption = {
  metric_names: string[];
  market_types: string[];
  record_sheets: string[];
};

export type ImportStats = {
  total_batches: number;
  mismatch_batches: number;
  categories: Record<string, number>;
};

export type ImportTargetSummary = {
  module_name: string;
  page_name: string;
  page_key: string;
  data_type: string;
  category: string;
  folder_path: string;
  expected_files: string[];
  uploaded_files: number;
  missing_files: number;
  latest_effective_date: string | null;
  latest_uploaded_at: string | null;
};

export type ImportVersionRow = {
  id: number | null;
  module_name: string;
  page_name: string;
  page_key: string | null;
  data_type: string;
  effective_date: string | null;
  version_name: string;
  version_tag: string;
  uploaded_at: string | null;
  uploaded_files: number;
  missing_files: number;
  owner: string;
  folder_path: string;
  expected_files: string[];
  uploaded_file_names: string[];
  missing_file_names: string[];
};

export type ImportVersionBoardResponse = {
  selected_date: string | null;
  rows: ImportVersionRow[];
};

export type CrawlerBridgeStatus = {
  ok: boolean;
  message: string;
  source_dir: string;
  total_files: number;
  pending_files: number;
  skipped_files: number;
  available_dates: string[];
  latest_date: string | null;
  preview_files: string[];
  checked_at: string | null;
};

export type ObjectOptionResponse = {
  object_names: string[];
  regions: string[];
};

export type RankingResponse = {
  title: string;
  unit: string | null;
  rows: { name: string; value: number | null }[];
};

export type DateOptionResponse = {
  dates: string[];
};

export type MarketClearingDayResponse = {
  selected_date: string | null;
  available_dates: string[];
  day_ahead_offer_price: number | null;
  day_ahead_clearing_price: number | null;
  day_ahead_clearing_energy: number | null;
  realtime_clearing_price: number | null;
  realtime_clearing_energy: number | null;
};

export type UnitStatusSegment = {
  start: string;
  end: string;
  status: string;
};

export type UnitCommitmentRow = {
  unit_name: string;
  plant_name: string | null;
  minimum_output_mw: number | null;
  rated_output_mw: number | null;
  current_segments: UnitStatusSegment[];
  previous_segments: UnitStatusSegment[];
};

export type UnitCommitmentLinkageResponse = {
  selected_date: string | null;
  previous_date: string | null;
  current_constraint_mode: string;
  previous_constraint_mode: string;
  previous_available: boolean;
  times: string[];
  rows: UnitCommitmentRow[];
  note: string;
};

export type TradingContextResponse = {
  selected_date: string | null;
  available_dates: string[];
  previous_date: string | null;
  next_date: string | null;
  status: "ready" | "partial" | "missing";
  status_label: string;
  completeness: number;
  updated_at: string | null;
  missing_items: string[];
  data_statuses: {
    key: string;
    label: string;
    status: "published" | "missing" | "partial";
    status_label: string;
    updated_at: string | null;
  }[];
};

export type TopologyStatusResponse = {
  ok: boolean;
  nodes: number;
  lines: number;
  channels: number;
  runs: number;
  day_ahead_dates: string[];
  real_time_dates: string[];
};

export type TopologyNode = {
  name: string;
  type: string | null;
  voltage_level: string | null;
  region: string | null;
  longitude: number | null;
  latitude: number | null;
  price: number | null;
  matched: boolean;
};

export type TopologyEdge = {
  line_name: string;
  source: string;
  target: string;
  voltage_level: string | null;
  capacity: number | null;
  sum_abs_spread: number | null;
  max_abs_spread: number | null;
  selected_time?: string | null;
  selected_spread?: number | null;
  selected_abs_spread?: number | null;
  peak_time: string | null;
  blocked: boolean;
};

export type TopologyResultResponse = {
  ok: boolean;
  effective_date: string;
  market_type: string;
  message: string;
  summary: {
    line_count?: number;
    matched_node_count?: number;
    total_node_count?: number;
    match_rate?: number;
    peak_time?: string | null;
      max_abs_spread?: number | null;
      created_at?: string | null;
      view_time?: string | null;
    };
    ranking: {
      line_name: string;
      node_start: string;
      node_end: string;
    voltage_level: string | null;
    sum_abs_spread: number | null;
    max_abs_spread: number | null;
    avg_abs_spread: number | null;
    peak_time: string | null;
      blocked_points: number | null;
      start_price_at_peak: number | null;
      end_price_at_peak: number | null;
      point_time?: string | null;
      point_index?: number | null;
      spread?: number | null;
      abs_spread?: number | null;
      is_blocked?: number | boolean | null;
    }[];
    causes?: {
      line_name: string;
      node_start: string;
      node_end: string;
      market_type: string;
      point_time: string | null;
      score: number;
      level: "high" | "medium" | "low";
      level_label: string;
      summary: string;
      evidence: {
        type: string;
        title: string;
        detail: string;
        source: string;
        score: number;
        matched_terms?: string[];
      }[];
    }[];
    section_overview?: {
      mode: "point" | "daily_peak";
      point_time?: string | null;
      realtime_clearing: {
        section_name: string;
        point_time: string | null;
        value: number;
        market_type: string | null;
        data_topic: string | null;
        level: "critical" | "high" | "watch" | "normal";
        level_label: string;
      }[];
      actual: {
        section_name: string;
        point_time: string | null;
        value: number;
        market_type: string | null;
        data_topic: string | null;
        level: "critical" | "high" | "watch" | "normal";
        level_label: string;
      }[];
    };
    available_times?: string[];
    network: {
    date?: string;
    market?: string;
    threshold?: number;
    nodes?: TopologyNode[];
    edges?: TopologyEdge[];
    match_rows?: { topology_node: string; matched_price_nodes: string[]; method: string; score: number }[];
  };
};

export type TradingMetricSnapshot = {
  key: string;
  label: string;
  value: number | null;
  unit: string;
  detail: string;
  delta: number | null;
  tone: "up" | "down" | "flat";
};

export type TradingRiskItem = {
  level: "high" | "warning" | "info";
  title: string;
  detail: string;
  source: string;
};

export type TradingMoment = {
  label: string;
  time: string | null;
  value: number | null;
  unit: string;
  detail: string;
};

export type TradingPremarketResponse = {
  context: TradingContextResponse;
  conclusion: string;
  risk_level: "high" | "medium" | "low" | "unknown";
  risk_label: string;
  metrics: TradingMetricSnapshot[];
  load_series: SeriesResponse["points"];
  b_space_series: SeriesResponse["points"];
  renewable_series: SeriesResponse["points"];
  reserve_series: SeriesResponse["points"];
  moments: TradingMoment[];
  risks: TradingRiskItem[];
  constraint_summary: Record<string, number | null>;
  market_summary: Record<string, number | null>;
};

export function getOverview() {
  return fetchJson<OverviewResponse>("/api/overview", {
    fallback: { metrics: [], import_batches: [] },
  });
}

export function getPolicies(search?: string) {
  const query = new URLSearchParams();
  if (search) {
    query.set("search", search);
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return fetchJson<PolicyDocument[]>(`/api/policies${suffix}`, { fallback: [], includeSession: true });
}

export function getPolicyAnalysisStatus() {
  return fetchJson<PolicyAnalysisStatus>("/api/policies/status", {
    fallback: { llm_enabled: false, total: 0, llm_count: 0, rule_count: 0, manual_count: 0 },
  });
}

export function getPolicyConnectivityTest() {
  return fetchJson<PolicyConnectivityTest>("/api/policies/connectivity-test", {
    fallback: {
      ok: false,
      category: "unknown",
      summary: "模型连通性测试失败。",
      detail: null,
      model: null,
      base_url: null,
      http_status: null,
    },
    includeSession: true,
  });
}

export function getPolicyVersions(policyId: number) {
  return fetchJson<PolicyAnalysisVersion[]>(`/api/policies/${policyId}/versions`, { fallback: [], includeSession: true });
}

export function getImportsPreview() {
  return fetchJson<ImportPreviewResponse>("/api/imports/preview", {
    fallback: { batches: [], notes: [] },
  });
}

export function getImportsPreviewFiltered(category?: string, mismatchOnly?: boolean, limit = 80, effectiveDate?: string) {
  const query = new URLSearchParams();
  if (category) {
    query.set("category", category);
  }
  if (effectiveDate) {
    query.set("effective_date", effectiveDate);
  }
  if (mismatchOnly) {
    query.set("mismatch_only", "true");
  }
  query.set("limit", String(limit));
  return fetchJson<ImportPreviewResponse>(`/api/imports/preview?${query.toString()}`, {
    fallback: { batches: [], notes: [] },
  });
}

export function getImportStats() {
  return fetchJson<ImportStats>("/api/imports/stats", {
    fallback: { total_batches: 0, mismatch_batches: 0, categories: {} },
  });
}

export function getImportTargets() {
  return fetchJson<ImportTargetSummary[]>("/api/imports/targets", {
    fallback: [],
  });
}

export function getImportVersionBoard(effectiveDate?: string) {
  const query = new URLSearchParams();
  if (effectiveDate) {
    query.set("effective_date", effectiveDate);
  }
  return fetchJson<ImportVersionBoardResponse>(`/api/imports/version-board?${query.toString()}`, {
    fallback: { selected_date: effectiveDate || null, rows: [] },
  });
}

export function getCrawlerBridgeStatus() {
  return fetchJson<CrawlerBridgeStatus>("/api/imports/crawler-bridge/status", {
    fallback: {
      ok: false,
      message: "暂未读取到爬虫同步状态。",
      source_dir: "",
      total_files: 0,
      pending_files: 0,
      skipped_files: 0,
      available_dates: [],
      latest_date: null,
      preview_files: [],
      checked_at: null,
    },
    includeSession: true,
  });
}

export function getSeries(
  metricName: string,
  marketType?: string,
  effectiveDate?: string,
  objectName?: string,
  dataTopic?: string,
  limit = 96,
  dateFrom?: string,
  dateTo?: string
) {
  const query = new URLSearchParams({ metric_name: metricName });
  if (marketType) {
    query.set("market_type", marketType);
  }
  if (effectiveDate) {
    query.set("effective_date", effectiveDate);
  }
  if (dateFrom) {
    query.set("date_from", dateFrom);
  }
  if (dateTo) {
    query.set("date_to", dateTo);
  }
  if (objectName) {
    query.set("object_name", objectName);
  }
  if (dataTopic) {
    query.set("data_topic", dataTopic);
  }
  query.set("limit", String(limit));
  return fetchJson<SeriesResponse>(`/api/disclosure/series?${query.toString()}`, {
    fallback: { title: metricName, unit: null, market_type: marketType ?? null, effective_date: "", points: [] },
  });
}

export function getRecords(sheetName: string) {
  const query = new URLSearchParams({ sheet_name: sheetName });
  return fetchJson<TableRow[]>(`/api/disclosure/records?${query.toString()}`, { fallback: [] });
}

export function getRecordsPaged(
  sheetName: string,
  page = 1,
  pageSize = 20,
  searchField?: string,
  searchValue?: string,
  searchField2?: string,
  searchValue2?: string
) {
  const query = new URLSearchParams({
    sheet_name: sheetName,
    page: String(page),
    page_size: String(pageSize),
  });
  if (searchField && searchValue) {
    query.set("search_field", searchField);
    query.set("search_value", searchValue);
  }
  if (searchField2 && searchValue2) {
    query.set("search_field_2", searchField2);
    query.set("search_value_2", searchValue2);
  }
  return fetchJson<RecordQueryResponse>(`/api/disclosure/records/query?${query.toString()}`, {
    fallback: { rows: [], total: 0, page, page_size: pageSize },
  });
}

export function getDisclosureOptions() {
  return fetchJson<DisclosureOption>("/api/disclosure/options", {
    fallback: { metric_names: [], market_types: [], record_sheets: [] },
  });
}

export function getDisclosureObjects(
  metricName: string,
  marketType?: string,
  dataTopic?: string,
  effectiveDate?: string,
  search?: string,
  region?: string
) {
  const query = new URLSearchParams({ metric_name: metricName });
  if (marketType) {
    query.set("market_type", marketType);
  }
  if (dataTopic) {
    query.set("data_topic", dataTopic);
  }
  if (effectiveDate) {
    query.set("effective_date", effectiveDate);
  }
  if (search) {
    query.set("search", search);
  }
  if (region) {
    query.set("region", region);
  }
  return fetchJson<ObjectOptionResponse>(`/api/disclosure/objects?${query.toString()}`, {
    fallback: { object_names: [], regions: [] },
  });
}

export function getDisclosureRanking(
  metricName: string,
  marketType?: string,
  dataTopic?: string,
  effectiveDate?: string,
  topN = 10,
  ascending = false,
  region?: string,
  search?: string
) {
  const query = new URLSearchParams({ metric_name: metricName, top_n: String(topN), ascending: String(ascending) });
  if (marketType) {
    query.set("market_type", marketType);
  }
  if (dataTopic) {
    query.set("data_topic", dataTopic);
  }
  if (effectiveDate) {
    query.set("effective_date", effectiveDate);
  }
  if (region) {
    query.set("region", region);
  }
  if (search) {
    query.set("search", search);
  }
  return fetchJson<RankingResponse>(`/api/disclosure/ranking?${query.toString()}`, {
    fallback: { title: metricName, unit: null, rows: [] },
  });
}

export function getDisclosureDates(metricName?: string, marketType?: string) {
  const query = new URLSearchParams();
  if (metricName) {
    query.set("metric_name", metricName);
  }
  if (marketType) {
    query.set("market_type", marketType);
  }
  return fetchJson<DateOptionResponse>(`/api/disclosure/dates?${query.toString()}`, {
    fallback: { dates: [] },
  });
}

export function getMarketClearingDay(effectiveDate?: string) {
  const query = new URLSearchParams();
  if (effectiveDate) {
    query.set("effective_date", effectiveDate);
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return fetchJson<MarketClearingDayResponse>(`/api/disclosure/market-clearing${suffix}`, {
    fallback: {
      selected_date: effectiveDate || null,
      available_dates: [],
      day_ahead_offer_price: null,
      day_ahead_clearing_price: null,
      day_ahead_clearing_energy: null,
      realtime_clearing_price: null,
      realtime_clearing_energy: null,
    },
  });
}

export function getUnitCommitmentLinkage(effectiveDate?: string) {
  const query = new URLSearchParams();
  if (effectiveDate) {
    query.set("effective_date", effectiveDate);
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return fetchJson<UnitCommitmentLinkageResponse>(`/api/disclosure/unit-commitment-linkage${suffix}`, {
    fallback: {
      selected_date: effectiveDate || null,
      previous_date: null,
      current_constraint_mode: "missing",
      previous_constraint_mode: "missing",
      previous_available: false,
      times: [],
      rows: [],
      note: "暂无机组开停机约束数据。",
    },
  });
}

export function getTradingContext(effectiveDate?: string) {
  const query = new URLSearchParams();
  if (effectiveDate) {
    query.set("effective_date", effectiveDate);
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return fetchJson<TradingContextResponse>(`/api/trading/context${suffix}`, {
    fallback: {
      selected_date: effectiveDate || null,
      available_dates: [],
      previous_date: null,
      next_date: null,
      status: "missing",
      status_label: "暂无数据",
      completeness: 0,
      updated_at: null,
      missing_items: [],
      data_statuses: [],
    },
  });
}

export function getPremarketDashboard(effectiveDate?: string) {
  const query = new URLSearchParams();
  if (effectiveDate) {
    query.set("effective_date", effectiveDate);
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const fallbackContext: TradingContextResponse = {
    selected_date: effectiveDate || null,
    available_dates: [],
    previous_date: null,
    next_date: null,
    status: "missing",
    status_label: "暂无数据",
    completeness: 0,
    updated_at: null,
    missing_items: [],
    data_statuses: [],
  };
  return fetchJson<TradingPremarketResponse>(`/api/trading/premarket${suffix}`, {
    fallback: {
      context: fallbackContext,
      conclusion: "盘前数据暂不可用。",
      risk_level: "unknown",
      risk_label: "待补充",
      metrics: [],
      load_series: [],
      b_space_series: [],
      renewable_series: [],
      reserve_series: [],
      moments: [],
      risks: [],
      constraint_summary: {},
      market_summary: {},
    },
  });
}

export function getTopologyStatus() {
  return fetchJson<TopologyStatusResponse>("/api/topology/status", {
    fallback: { ok: false, nodes: 0, lines: 0, channels: 0, runs: 0, day_ahead_dates: [], real_time_dates: [] },
  });
}

export function getTopologyResult(effectiveDate: string, marketType: string, pointTime?: string) {
  const query = new URLSearchParams({
    effective_date: effectiveDate,
    market_type: marketType,
    run_if_missing: "true",
  });
  if (pointTime) {
    query.set("point_time", pointTime);
  }
  return fetchJson<TopologyResultResponse>(`/api/topology/result?${query.toString()}`, {
    fallback: {
      ok: false,
      effective_date: effectiveDate,
      market_type: marketType,
        message: "拓扑分析暂不可用。",
        summary: {},
        ranking: [],
        causes: [],
        network: {},
      },
  });
}
