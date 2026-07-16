from app.repositories.system import fetch_overview_snapshot
from app.schemas import ImportBatchSummary, OverviewMetric, OverviewResponse


def get_overview() -> OverviewResponse:
    import_batches, series_count, record_count, policy_count = fetch_overview_snapshot()
    metrics = [
        OverviewMetric(title="样例导入批次", value=str(len(import_batches)), detail="已按文件与 sheet 分批次登记"),
        OverviewMetric(title="时序数据规模", value=str(series_count), detail="按当前记录编号快速统计"),
        OverviewMetric(title="明细记录规模", value=str(record_count), detail="按当前记录编号快速统计"),
        OverviewMetric(title="政策文件", value=str(policy_count), detail="已登记政策 PDF，并保留解析结果"),
    ]
    return OverviewResponse(
        metrics=metrics,
        import_batches=[ImportBatchSummary(**dict(row)) for row in import_batches],
    )
