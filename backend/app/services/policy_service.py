import json
from pathlib import Path

from fastapi import HTTPException

from app.repositories.policies import (
    fetch_policy_detail,
    fetch_policy_mode_counts,
    fetch_policy_rows,
    fetch_policy_versions,
    update_policy_document,
)
from app.schemas import (
    PolicyAnalysisStatusResponse,
    PolicyAnalysisVersion,
    PolicyChatResponse,
    PolicyDocument,
    PolicyWorkspaceDocument,
    PolicyWorkspaceReportResponse,
)
from app.services.importer import import_policy_file
from app.services.policy_ai import (
    answer_policy_question,
    answer_workspace_policy_question,
    generate_workspace_policy_report,
    humanize_analysis_note,
    llm_policy_analysis_enabled,
    test_llm_connectivity,
)
from app.services.policy_chat_guard import check_chat_rate_limit, is_policy_chat_question_allowed


def list_policies(search: str | None = None, include_debug: bool = False) -> list[PolicyDocument]:
    rows = fetch_policy_rows(search)
    return [
        PolicyDocument(
            id=row["id"],
            title=row["title"],
            issuer=row["issuer"],
            region=row["region"],
            policy_date=row["policy_date"],
            summary=row["summary"],
            scope_summary=row["scope_summary"],
            impact_summary=row["impact_summary"],
            key_points=json.loads(row["key_points_json"] or "[]"),
            impact_tags=json.loads(row["impact_tags_json"] or "[]"),
            subject_impacts=json.loads(row["subject_impacts_json"] or "[]"),
            formula_items=json.loads(row["formula_items_json"] or "[]"),
            fee_items=json.loads(row["fee_items_json"] or "[]"),
            responsibility_matrix=json.loads(row["responsibility_matrix_json"] or "[]"),
            time_nodes=json.loads(row["time_nodes_json"] or "[]"),
            risk_points=json.loads(row["risk_points_json"] or "[]"),
            action_suggestions=json.loads(row["action_suggestions_json"] or "[]"),
            content_preview=row["content_preview"],
            analysis_mode=row["analysis_mode"],
            analysis_model=row["analysis_model"],
            analysis_profile=row["analysis_profile"],
            analysis_note=humanize_analysis_note(row["analysis_note"], row["analysis_profile"]),
            analysis_debug_note=row["analysis_debug_note"] if include_debug else None,
            manual_updated_at=row["manual_updated_at"],
            file_name=row["file_name"],
            version_count=int(row["version_count"] or 0),
        )
        for row in rows
    ]


def generate_policy_ai_analysis(policy_id: int, include_debug: bool = False) -> dict[str, object]:
    row = _load_policy_detail(policy_id)
    if not llm_policy_analysis_enabled():
        raise HTTPException(status_code=400, detail="当前未配置大模型，无法触发 AI 解读")

    import_policy_file(Path(row["file_path"]), trigger_ai=True, trigger_type="manual_ai")
    refreshed = _load_policy_detail(policy_id)
    debug_note = refreshed["analysis_debug_note"]
    if refreshed["analysis_mode"] != "llm" and debug_note:
        detail = "AI 调用暂未成功，系统已切换为规则解读。"
        if include_debug:
            detail = f"{detail} 具体原因：{debug_note}"
        raise HTTPException(status_code=502, detail=detail)
    return {"status": "ok", "policy_id": policy_id}


def list_policy_versions(policy_id: int, include_debug: bool = False) -> list[PolicyAnalysisVersion]:
    rows = fetch_policy_versions(policy_id)
    return [
        PolicyAnalysisVersion(
            id=int(row["id"]),
            version_no=int(row["version_no"]),
            trigger_type=row["trigger_type"],
            analysis_mode=row["analysis_mode"],
            analysis_model=row["analysis_model"],
            analysis_profile=row["analysis_profile"],
            analysis_note=humanize_analysis_note(row["analysis_note"], row["analysis_profile"]),
            analysis_debug_note=row["analysis_debug_note"] if include_debug else None,
            created_at=row["created_at"],
        )
        for row in rows
    ]


def get_policy_analysis_status() -> PolicyAnalysisStatusResponse:
    counts = fetch_policy_mode_counts()
    llm_count = counts.get("llm", 0)
    rule_count = counts.get("rule", 0)
    manual_count = counts.get("manual", 0)
    total = llm_count + rule_count + manual_count
    return PolicyAnalysisStatusResponse(
        llm_enabled=llm_policy_analysis_enabled(),
        total=total,
        llm_count=llm_count,
        rule_count=rule_count,
        manual_count=manual_count,
    )


def get_policy_connectivity_test() -> dict[str, object]:
    return test_llm_connectivity()


def update_policy_analysis(
    policy_id: int,
    summary: str,
    scope_summary: str,
    impact_summary: str,
    key_points_text: str,
    impact_tags_text: str,
) -> dict[str, object]:
    key_points = [line.strip() for line in key_points_text.replace("\r", "").split("\n") if line.strip()]
    impact_tags = [item.strip() for item in impact_tags_text.replace("\n", ",").split(",") if item.strip()]
    updated = update_policy_document(
        policy_id=policy_id,
        summary=summary.strip(),
        scope_summary=scope_summary.strip(),
        impact_summary=impact_summary.strip(),
        key_points_json=json.dumps(key_points, ensure_ascii=False),
        impact_tags_json=json.dumps(impact_tags, ensure_ascii=False),
    )
    if not updated:
        raise HTTPException(status_code=404, detail="未找到对应政策")
    return {"status": "ok", "policy_id": policy_id}


def chat_with_policy(policy_id: int, question: str, history: list[dict[str, str]] | None, client_key: str) -> PolicyChatResponse:
    row = _load_policy_detail(policy_id)
    allowed, remaining_quota = check_chat_rate_limit(client_key)
    if not allowed:
        raise HTTPException(status_code=429, detail="问答过于频繁，请稍后再试")

    history = history or []
    history_text = " ".join(item.get("content", "") for item in history[-6:])
    if not is_policy_chat_question_allowed(question, history_text):
        return PolicyChatResponse(
            answer="当前问答仅支持电力市场或能源市场相关内容，例如现货交易、中长期交易、申报、出清、结算、偏差、新能源等主题。",
            evidence=[],
            mode="guard",
            remaining_quota=remaining_quota,
            related_policies=[],
        )

    result = answer_policy_question(_to_policy_ai_document(row), question, history)
    return PolicyChatResponse(
        answer=result["answer"],
        evidence=result.get("evidence", []),
        mode=result.get("mode", "rule"),
        remaining_quota=remaining_quota,
        related_policies=[policy_id],
    )


def generate_workspace_report(
    policy_ids: list[int],
    reanalyze: bool = False,
    include_debug: bool = False,
) -> PolicyWorkspaceReportResponse:
    normalized_ids = _normalize_workspace_policy_ids(policy_ids)
    if len(normalized_ids) < 2:
        raise HTTPException(status_code=400, detail="至少选择两份规则文件后再生成联动解读报告。")

    rows = _load_policy_rows_by_ids(normalized_ids)
    documents = [_to_policy_ai_document(row) for row in rows]
    report = generate_workspace_policy_report(documents, prefer_llm=False)
    mode = str(report.get("mode") or "rule")
    if reanalyze and include_debug:
        mode = f"{mode} (sequential_reanalyze_expected)"

    return PolicyWorkspaceReportResponse(
        policy_ids=normalized_ids,
        mode=mode,
        report_title=str(report.get("report_title") or "联动政策解读报告"),
        report_text=str(report.get("report_text") or ""),
        evidence=[str(item) for item in report.get("evidence", []) if str(item).strip()][:6],
        documents=[
            PolicyWorkspaceDocument(
                id=int(row["id"]),
                title=row["title"],
                analysis_mode=row["analysis_mode"],
                analysis_note=humanize_analysis_note(row["analysis_note"], row["analysis_profile"]),
            )
            for row in rows
        ],
    )


def chat_with_workspace(
    policy_ids: list[int],
    question: str,
    history: list[dict[str, str]] | None,
    report_text: str,
    client_key: str,
) -> PolicyChatResponse:
    normalized_ids = _normalize_workspace_policy_ids(policy_ids)
    if len(normalized_ids) < 2:
        raise HTTPException(status_code=400, detail="至少选择两份规则文件后再进行联动问询。")

    rows = _load_policy_rows_by_ids(normalized_ids)
    scoped_client = f"{client_key}:workspace:{'-'.join(str(item) for item in normalized_ids)}"
    allowed, remaining_quota = check_chat_rate_limit(scoped_client)
    if not allowed:
        raise HTTPException(status_code=429, detail="问询过于频繁，请稍后再试")

    history = history or []
    history_text = " ".join(item.get("content", "") for item in history[-6:])
    if not is_policy_chat_question_allowed(question, history_text):
        return PolicyChatResponse(
            answer="当前问询仅支持电力市场或能源市场相关内容，例如现货交易、中长期交易、申报、出清、结算、偏差、新能源等主题。",
            evidence=[],
            mode="guard",
            remaining_quota=remaining_quota,
            related_policies=[],
        )

    documents = [_to_policy_ai_document(row) for row in rows]
    result = answer_workspace_policy_question(documents, question, history, report_text)
    return PolicyChatResponse(
        answer=result.get("answer", ""),
        evidence=result.get("evidence", []),
        mode=result.get("mode", "rule"),
        remaining_quota=remaining_quota,
        related_policies=result.get("related_policies", []),
    )


def _normalize_workspace_policy_ids(policy_ids: list[int]) -> list[int]:
    normalized: list[int] = []
    for item in policy_ids:
        if not isinstance(item, int):
            continue
        if item <= 0 or item in normalized:
            continue
        normalized.append(item)
    return normalized[:8]


def _load_policy_detail(policy_id: int):
    row = fetch_policy_detail(policy_id)
    if not row:
        raise HTTPException(status_code=404, detail="未找到对应政策")
    return row


def _load_policy_rows_by_ids(policy_ids: list[int]) -> list:
    rows = [_load_policy_detail(policy_id) for policy_id in policy_ids]
    return sorted(rows, key=lambda row: policy_ids.index(int(row["id"])))


def _to_policy_ai_document(row) -> dict[str, object]:
    document = dict(row)
    document["key_points"] = json.loads(row["key_points_json"] or "[]")
    document["impact_tags"] = json.loads(row["impact_tags_json"] or "[]")
    document["subject_impacts"] = json.loads(row["subject_impacts_json"] or "[]")
    document["formula_items"] = json.loads(row["formula_items_json"] or "[]")
    document["fee_items"] = json.loads(row["fee_items_json"] or "[]")
    document["responsibility_matrix"] = json.loads(row["responsibility_matrix_json"] or "[]")
    document["time_nodes"] = json.loads(row["time_nodes_json"] or "[]")
    document["risk_points"] = json.loads(row["risk_points_json"] or "[]")
    document["action_suggestions"] = json.loads(row["action_suggestions_json"] or "[]")
    return document
