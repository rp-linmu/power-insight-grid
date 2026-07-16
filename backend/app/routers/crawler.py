from fastapi import APIRouter, Body, HTTPException, Query
from datetime import datetime, timedelta
from copy import deepcopy

from app.services.crawler_bridge import audit_crawler_imports, sync_crawler_downloads
from app.services.crawler_control_service import (
    CrawlerControlError,
    crawler_get,
    crawler_post,
    get_crawler_service_status,
)


router = APIRouter(prefix="/api/crawler", tags=["crawler"])


@router.get("/service-status")
def service_status() -> dict[str, object]:
    return get_crawler_service_status()


@router.get("/tasks")
def tasks() -> dict[str, object]:
    return _split_task_payload(_get("/api/tasks"))


@router.post("/audit")
def audit(payload: dict[str, object] = Body(...)) -> dict[str, object]:
    if not _crawler_supports_split_tasks():
        return _audit_with_legacy_service(payload)
    return _post("/api/audit", payload)


@router.post("/import-audit")
def import_audit(payload: dict[str, object] = Body(...)) -> dict[str, object]:
    task_ids = payload.get("taskIds")
    try:
        return audit_crawler_imports(
            str(payload.get("start") or ""),
            str(payload.get("end") or ""),
            [str(item) for item in task_ids] if isinstance(task_ids, list) else None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/run")
def run(payload: dict[str, object] = Body(...)) -> dict[str, object]:
    if not _crawler_supports_split_tasks():
        return _post("/api/run", _legacy_run_payload(payload))
    return _post("/api/run", payload)


@router.post("/stop")
def stop(payload: dict[str, object] = Body(...)) -> dict[str, object]:
    return _post("/api/stop", payload)


@router.get("/status")
def status(id: str = Query(...)) -> dict[str, object]:
    return _get("/api/status", {"id": id})


@router.post("/sync")
def sync(
    effective_date: str | None = Query(None),
    payload: dict[str, object] = Body(default={}),
) -> dict[str, object]:
    source_paths = payload.get("source_paths")
    return sync_crawler_downloads(
        effective_date,
        overwrite=bool(payload.get("overwrite")),
        source_paths=[str(item) for item in source_paths] if isinstance(source_paths, list) else None,
    )


def _get(path: str, query: dict[str, str] | None = None) -> dict[str, object]:
    try:
        return crawler_get(path, query)
    except CrawlerControlError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def _post(path: str, payload: dict[str, object]) -> dict[str, object]:
    try:
        return crawler_post(path, payload)
    except CrawlerControlError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


SPLIT_TASKS = {
    "basic-day-ahead": {
        "id": "basic-day-ahead",
        "name": "基本面数据-预测",
        "description": "信息披露查询“预测”页全部导出",
        "legacy_id": "basic-day-ahead",
        "slot_key": "day-ahead",
        "stage_mode": "day-ahead",
        "slot_label": "预测",
    },
    "basic-real-time": {
        "id": "basic-real-time",
        "name": "基本面数据-实际",
        "description": "信息披露查询“实际”页全部导出",
        "legacy_id": "basic-day-ahead",
        "slot_key": "real-time",
        "stage_mode": "real-time",
        "slot_label": "实际",
    },
    "spot-hourly-type-energy-day-ahead": {
        "id": "spot-hourly-type-energy-day-ahead",
        "name": "现货分时分类型出清电量-日前",
        "description": "首页“现货分时分类型出清电量”模块，切换日前后导出",
        "legacy_id": "spot-hourly-type-energy",
        "slot_key": "day-ahead",
        "stage_mode": "day-ahead",
        "slot_label": "日前",
    },
    "spot-hourly-type-energy-real-time": {
        "id": "spot-hourly-type-energy-real-time",
        "name": "现货分时分类型出清电量-实时",
        "description": "首页“现货分时分类型出清电量”模块，切换实时后导出",
        "legacy_id": "spot-hourly-type-energy",
        "slot_key": "real-time",
        "stage_mode": "real-time",
        "slot_label": "实时",
    },
}


LEGACY_TASK_IDS = {"basic-day-ahead", "spot-hourly-type-energy"}
SPLIT_ORDER = ["basic-day-ahead", "basic-real-time", "spot-hourly-type-energy-day-ahead", "spot-hourly-type-energy-real-time"]


def _split_task_payload(payload: dict[str, object]) -> dict[str, object]:
    tasks = payload.get("tasks")
    if not isinstance(tasks, list):
        return payload
    if any(isinstance(task, dict) and task.get("id") == "basic-real-time" for task in tasks):
        return payload

    result: list[dict[str, object]] = []
    for task in tasks:
        if not isinstance(task, dict):
            continue
        task_id = str(task.get("id") or "")
        if task_id == "basic-day-ahead":
            result.extend(_split_task_item(task, "basic-day-ahead", "basic-real-time"))
        elif task_id == "spot-hourly-type-energy":
            result.extend(_split_task_item(task, "spot-hourly-type-energy-day-ahead", "spot-hourly-type-energy-real-time"))
        else:
            result.append(task)
    return {**payload, "tasks": result}


def _split_task_item(source: dict[str, object], *task_ids: str) -> list[dict[str, object]]:
    status = str(source.get("status") or "pending")
    return [
        {
            "id": task_id,
            "name": SPLIT_TASKS[task_id]["name"],
            "description": SPLIT_TASKS[task_id]["description"],
            "status": status,
        }
        for task_id in task_ids
    ]


def _crawler_supports_split_tasks() -> bool:
    try:
        tasks = _get("/api/tasks").get("tasks", [])
    except HTTPException:
        raise
    return any(isinstance(task, dict) and task.get("id") == "basic-real-time" for task in tasks)


def _audit_with_legacy_service(payload: dict[str, object]) -> dict[str, object]:
    selected_task_ids = [str(item) for item in payload.get("taskIds", []) if item] if isinstance(payload.get("taskIds"), list) else []
    split_ids = [task_id for task_id in selected_task_ids if task_id in SPLIT_TASKS]
    normal_ids = [task_id for task_id in selected_task_ids if task_id not in SPLIT_TASKS]
    results: list[dict[str, object]] = []

    if normal_ids:
        normal_payload = {**payload, "taskIds": normal_ids}
        results.append(_post("/api/audit", normal_payload))
    for task_id in split_ids:
        rule = SPLIT_TASKS[task_id]
        legacy_payload = {
            **payload,
            "taskIds": [rule["legacy_id"]],
            "stageMode": rule["stage_mode"],
        }
        results.append(_rewrite_legacy_audit_result(_post("/api/audit", legacy_payload), task_id))

    return _merge_audit_results(results, str(payload.get("start") or ""), str(payload.get("end") or ""))


def _rewrite_legacy_audit_result(result: dict[str, object], task_id: str) -> dict[str, object]:
    rewritten = deepcopy(result)
    rule = SPLIT_TASKS[task_id]
    for key in ("missing", "supplementTargets"):
        rows = rewritten.get(key)
        if not isinstance(rows, list):
            continue
        for row in rows:
            if not isinstance(row, dict):
                continue
            row["taskId"] = task_id
            if "taskName" in row:
                row["taskName"] = rule["name"]
            if "slot" in row:
                row["slot"] = rule["slot_label"]
            if "slotKey" in row:
                row["slotKey"] = rule["slot_key"]
    return rewritten


def _merge_audit_results(results: list[dict[str, object]], start: str, end: str) -> dict[str, object]:
    if not results:
        return {
            "ok": True,
            "start": start,
            "end": end,
            "rootDir": "",
            "checkedTasks": 0,
            "checkedDates": len(_enumerate_dates(start, end)) if start and end else 0,
            "expectedSlots": 0,
            "presentSlots": 0,
            "missingSlots": 0,
            "completeness": 100,
            "fileCount": 0,
            "missing": [],
            "invalidFiles": [],
            "supplementTargets": [],
            "unsupported": [],
            "checkedAt": "",
        }

    expected = sum(int(item.get("expectedSlots") or 0) for item in results)
    present = sum(int(item.get("presentSlots") or 0) for item in results)
    missing = _flatten_results(results, "missing")
    supplement_targets = _unique_targets(_flatten_results(results, "supplementTargets"))
    return {
        "ok": all(bool(item.get("ok", True)) for item in results),
        "start": start,
        "end": end,
        "rootDir": str(results[0].get("rootDir") or ""),
        "checkedTasks": sum(int(item.get("checkedTasks") or 0) for item in results),
        "checkedDates": max((int(item.get("checkedDates") or 0) for item in results), default=0),
        "expectedSlots": expected,
        "presentSlots": present,
        "missingSlots": len(missing),
        "completeness": round((present / expected) * 100, 1) if expected else 100,
        "fileCount": sum(int(item.get("fileCount") or 0) for item in results),
        "missing": missing,
        "invalidFiles": _flatten_results(results, "invalidFiles"),
        "supplementTargets": supplement_targets,
        "unsupported": _flatten_results(results, "unsupported"),
        "checkedAt": str(results[-1].get("checkedAt") or ""),
    }


def _legacy_run_payload(payload: dict[str, object]) -> dict[str, object]:
    normalized = deepcopy(payload)
    exact_targets = normalized.get("exactTargets")
    if isinstance(exact_targets, list) and exact_targets:
        normalized["exactTargets"] = [_legacy_target(item) for item in exact_targets if isinstance(item, dict)]
        normalized["taskIds"] = sorted({str(item.get("taskId")) for item in normalized["exactTargets"] if item.get("taskId")})
        normalized["stageMode"] = "both"
        return normalized

    task_ids = [str(item) for item in normalized.get("taskIds", []) if item] if isinstance(normalized.get("taskIds"), list) else []
    dates = _enumerate_dates(str(normalized.get("start") or ""), str(normalized.get("end") or ""))
    targets = []
    for date in dates:
        for task_id in task_ids:
            targets.append(_legacy_target({"date": date, "taskId": task_id}))
    normalized["exactTargets"] = targets
    normalized["taskIds"] = sorted({str(item.get("taskId")) for item in targets if item.get("taskId")})
    normalized["stageMode"] = "both"
    return normalized


def _legacy_target(target: dict[str, object]) -> dict[str, object]:
    task_id = str(target.get("taskId") or "")
    rule = SPLIT_TASKS.get(task_id)
    if not rule:
        return target
    rewritten = {**target, "taskId": rule["legacy_id"], "slotKey": rule["slot_key"]}
    return rewritten


def _flatten_results(results: list[dict[str, object]], key: str) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for result in results:
        value = result.get(key)
        if isinstance(value, list):
            rows.extend(row for row in value if isinstance(row, dict))
    return rows


def _unique_targets(targets: list[dict[str, object]]) -> list[dict[str, object]]:
    seen: set[tuple[str, str, str]] = set()
    unique: list[dict[str, object]] = []
    for target in targets:
        key = (str(target.get("date") or ""), str(target.get("taskId") or ""), str(target.get("slotKey") or ""))
        if key in seen:
            continue
        seen.add(key)
        unique.append(target)
    return sorted(unique, key=lambda item: (str(item.get("date") or ""), str(item.get("taskId") or ""), str(item.get("slotKey") or "")))


def _enumerate_dates(start: str, end: str) -> list[str]:
    start_date = datetime.strptime(start, "%Y-%m-%d").date()
    end_date = datetime.strptime(end, "%Y-%m-%d").date()
    return [(start_date + timedelta(days=offset)).isoformat() for offset in range((end_date - start_date).days + 1)]
