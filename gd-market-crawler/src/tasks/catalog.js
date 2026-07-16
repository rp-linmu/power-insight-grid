const CATALOG = [
  { id: "market_overview", category: "市场出清", name: "市场情况", endpointKey: "market_overview" },
  { id: "market_participant_spot", category: "市场出清", name: "市场主体参与现货情况", endpointKey: "market_participant_spot" },
  { id: "unified_settlement_price", category: "市场出清", name: "用电侧统一结算价", endpointKey: "unified_settlement_price" },
  { id: "market_power_consumption", category: "市场出清", name: "市场用电信息", endpointKey: "market_power_consumption" },
  { id: "spot_daily_clearing", category: "市场出清", name: "现货分日出清量价", endpointKey: "spot_daily_clearing" },
  { id: "spot_hourly_type_energy", category: "市场出清", name: "现货分时分类型出清电量", endpointKey: "spot_hourly_type_energy" },
  { id: "day_ahead_node_price", category: "市场出清", name: "日前节点电价", endpointKey: "day_ahead_node_price" },
  { id: "real_time_node_price", category: "市场出清", name: "实时节点电价", endpointKey: "real_time_node_price" },
  { id: "fundamental_load", category: "基本面数据", name: "负荷数据", endpointKey: "fundamental_load" },
  { id: "fundamental_generation", category: "基本面数据", name: "发电数据", endpointKey: "fundamental_generation" },
  { id: "fundamental_new_energy", category: "基本面数据", name: "新能源数据", endpointKey: "fundamental_new_energy" },
  { id: "daily_settlement_overview", category: "日清算概览", name: "日清算概览", endpointKey: "daily_settlement_overview" },
  { id: "monthly_settlement_overview", category: "月结算概览", name: "月结算概览", endpointKey: "monthly_settlement_overview" },
  { id: "market_subject_generator", category: "市场主体", name: "发电企业", endpointKey: "market_subject_generator" },
  { id: "market_subject_retailer", category: "市场主体", name: "售电公司", endpointKey: "market_subject_retailer" },
  { id: "market_subject_user", category: "市场主体", name: "电力用户", endpointKey: "market_subject_user" },
  { id: "trade_market_quote", category: "交易市场行情", name: "交易市场行情", endpointKey: "trade_market_quote" },
  { id: "weekly_time_deal_result", category: "交易市场行情", name: "周度分时成交结果", endpointKey: "weekly_time_deal_result" }
];

function listCatalogTasks() {
  return CATALOG.slice();
}

function resolveTasks(taskIds) {
  if (!taskIds || taskIds.includes("all")) return listCatalogTasks();
  const taskSet = new Set(taskIds);
  const tasks = CATALOG.filter((task) => taskSet.has(task.id) || taskSet.has(task.category));
  const missing = taskIds.filter((id) => id !== "all" && !tasks.some((task) => task.id === id || task.category === id));
  if (missing.length > 0) {
    throw new Error(`未知任务: ${missing.join(", ")}`);
  }
  return tasks;
}

module.exports = { listCatalogTasks, resolveTasks };
