import json
from pathlib import Path

from fastapi import APIRouter, Form, HTTPException, Query, Request
from fastapi.responses import FileResponse

from app.repositories.policies import fetch_policy_detail
from app.schemas import (
    PolicyAnalysisStatusResponse,
    PolicyAnalysisVersion,
    PolicyChatResponse,
    PolicyConnectivityTestResponse,
    PolicyDocument,
    PolicyWorkspaceReportResponse,
)
from app.services.policy_service import (
    chat_with_policy,
    chat_with_workspace,
    generate_policy_ai_analysis,
    generate_workspace_report,
    get_policy_analysis_status,
    get_policy_connectivity_test,
    list_policies,
    list_policy_versions,
    update_policy_analysis,
)


router = APIRouter()


@router.get("/api/policies", response_model=list[PolicyDocument])
def policies(
    search: str | None = Query(None, description="Policy title keyword"),
) -> list[PolicyDocument]:
    return list_policies(search, include_debug=True)


@router.post("/api/policies/workspace/report", response_model=PolicyWorkspaceReportResponse)
def workspace_report(
    policy_ids_json: str = Form("[]"),
    reanalyze: bool = Form(False),
) -> PolicyWorkspaceReportResponse:
    try:
        raw_ids = json.loads(policy_ids_json or "[]")
        policy_ids = [int(item) for item in raw_ids if str(item).isdigit()]
    except (ValueError, TypeError, json.JSONDecodeError):
        policy_ids = []
    return generate_workspace_report(policy_ids, reanalyze=reanalyze, include_debug=True)


@router.post("/api/policies/workspace/chat", response_model=PolicyChatResponse)
def workspace_chat(
    request: Request,
    policy_ids_json: str = Form("[]"),
    question: str = Form(""),
    report_text: str = Form(""),
    history_json: str = Form("[]"),
) -> PolicyChatResponse:
    try:
        raw_ids = json.loads(policy_ids_json or "[]")
        policy_ids = [int(item) for item in raw_ids if str(item).isdigit()]
    except (ValueError, TypeError, json.JSONDecodeError):
        policy_ids = []
    try:
        history = json.loads(history_json or "[]")
        if not isinstance(history, list):
            history = []
    except json.JSONDecodeError:
        history = []
    client_host = request.client.host if request.client else "anonymous"
    return chat_with_workspace(policy_ids, question, history, report_text, client_host)


@router.post("/api/policies/{policy_id}/reanalyze")
def reanalyze(
    policy_id: int,
) -> dict[str, object]:
    return generate_policy_ai_analysis(policy_id, include_debug=True)


@router.get("/api/policies/status", response_model=PolicyAnalysisStatusResponse)
def policy_status() -> PolicyAnalysisStatusResponse:
    return get_policy_analysis_status()


@router.post("/api/policies/connectivity-test", response_model=PolicyConnectivityTestResponse)
def policy_connectivity_test() -> PolicyConnectivityTestResponse:
    return PolicyConnectivityTestResponse(**get_policy_connectivity_test())


@router.get("/api/policies/{policy_id}/versions", response_model=list[PolicyAnalysisVersion])
def policy_versions(policy_id: int) -> list[PolicyAnalysisVersion]:
    return list_policy_versions(policy_id, include_debug=True)


@router.post("/api/policies/{policy_id}/edit")
def edit_policy(
    policy_id: int,
    summary: str = Form(""),
    scope_summary: str = Form(""),
    impact_summary: str = Form(""),
    key_points_text: str = Form(""),
    impact_tags_text: str = Form(""),
) -> dict[str, object]:
    return update_policy_analysis(policy_id, summary, scope_summary, impact_summary, key_points_text, impact_tags_text)


@router.post("/api/policies/{policy_id}/chat", response_model=PolicyChatResponse)
def chat_policy(
    request: Request,
    policy_id: int,
    question: str = Form(""),
    history_json: str = Form("[]"),
) -> PolicyChatResponse:
    try:
        history = json.loads(history_json or "[]")
        if not isinstance(history, list):
            history = []
    except json.JSONDecodeError:
        history = []
    client_host = request.client.host if request.client else "anonymous"
    return chat_with_policy(policy_id, question, history, client_host)


@router.get("/api/policies/{policy_id}/download")
def download_policy(policy_id: int):
    row = fetch_policy_detail(policy_id)
    if not row:
        raise HTTPException(status_code=404, detail="未找到对应政策")
    file_path = Path(row["file_path"])
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="政策文件不存在")
    return FileResponse(path=file_path, filename=file_path.name, media_type="application/pdf")
