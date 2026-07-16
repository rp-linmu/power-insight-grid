import json
import re
from typing import Any
from urllib import request
from urllib.error import HTTPError, URLError

from app.core.config import POLICY_LLM_API_KEY, POLICY_LLM_BASE_URL, POLICY_LLM_MODEL, POLICY_LLM_TIMEOUT
from app.services.policy_profiles import (
    build_policy_chunk_messages,
    build_policy_messages,
    build_policy_synthesis_messages,
    select_policy_profile,
)
from app.services.policy_validation import validate_policy_analysis

LONG_POLICY_THRESHOLD = 18000
POLICY_CHUNK_SIZE = 9000
MAX_POLICY_CHUNKS = 14
WORKSPACE_DOC_CONTENT_LIMIT = 2800
WORKSPACE_TOTAL_CONTEXT_LIMIT = 18000
CHUNK_PRIORITY_KEYWORDS = [
    "公式",
    "费用",
    "分摊",
    "返还",
    "退补",
    "责任",
    "权责",
    "时间",
    "周期",
    "售电公司",
    "新能源",
    "发电企业",
    "交易申报",
    "市场出清",
    "结算",
    "偏差",
    "合约",
    "曲线",
]


def llm_policy_analysis_enabled() -> bool:
    return bool(POLICY_LLM_API_KEY and POLICY_LLM_MODEL)


def test_llm_connectivity() -> dict[str, object]:
    if not llm_policy_analysis_enabled():
        return {
            "ok": False,
            "category": "not_configured",
            "summary": "当前未配置大模型。",
            "detail": "缺少 POLICY_LLM_API_KEY 或 POLICY_LLM_MODEL。",
            "model": POLICY_LLM_MODEL or None,
            "base_url": POLICY_LLM_BASE_URL,
            "http_status": None,
        }

    payload = {
        "model": POLICY_LLM_MODEL,
        "temperature": 0,
        "max_tokens": 8,
        "messages": [
            {"role": "system", "content": "You are a connectivity test assistant."},
            {"role": "user", "content": "Reply with the single word pong."},
        ],
    }
    req = request.Request(
        f"{POLICY_LLM_BASE_URL}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {POLICY_LLM_API_KEY}",
        },
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=min(POLICY_LLM_TIMEOUT, 20)) as resp:
            response_payload = json.loads(resp.read().decode("utf-8"))
        content = extract_message_content(response_payload)
        return {
            "ok": True,
            "category": "ok",
            "summary": "模型连通性正常。",
            "detail": f"接口调用成功，已收到模型响应：{content[:80].strip() or '空文本响应'}",
            "model": POLICY_LLM_MODEL,
            "base_url": POLICY_LLM_BASE_URL,
            "http_status": 200,
        }
    except HTTPError as exc:
        body_text = read_http_error_body(exc)
        category = classify_http_error(exc.code, body_text)
        return {
            "ok": False,
            "category": category,
            "summary": summarize_http_error(exc.code, category),
            "detail": format_http_error_detail(exc, body_text),
            "model": POLICY_LLM_MODEL,
            "base_url": POLICY_LLM_BASE_URL,
            "http_status": exc.code,
        }
    except URLError as exc:
        return {
            "ok": False,
            "category": "network_blocked",
            "summary": "网络连接被拦截或不可达。",
            "detail": f"无法连接到模型接口：{exc.reason}",
            "model": POLICY_LLM_MODEL,
            "base_url": POLICY_LLM_BASE_URL,
            "http_status": None,
        }
    except TimeoutError:
        return {
            "ok": False,
            "category": "timeout",
            "summary": "模型接口请求超时。",
            "detail": "请求在超时时间内未返回，可检查网络质量或上游服务状态。",
            "model": POLICY_LLM_MODEL,
            "base_url": POLICY_LLM_BASE_URL,
            "http_status": None,
        }
    except (ValueError, KeyError, json.JSONDecodeError) as exc:
        return {
            "ok": False,
            "category": "invalid_response",
            "summary": "模型接口返回格式异常。",
            "detail": f"响应解析失败：{exc}",
            "model": POLICY_LLM_MODEL,
            "base_url": POLICY_LLM_BASE_URL,
            "http_status": None,
        }


def enhance_policy_analysis_with_llm(title: str, content_text: str, fallback: dict[str, object]) -> dict[str, object]:
    profile = select_policy_profile(fallback)
    base_result = {
        **fallback,
        "analysis_profile": profile["name"],
        "analysis_note": f"Using profile: {profile['name']}",
        "analysis_debug_note": None,
    }

    if not llm_policy_analysis_enabled():
        return {
            **base_result,
            "analysis_mode": "rule",
            "analysis_model": None,
            "analysis_note": f"当前未配置大模型，正在使用“{profile['name']}”规则解读。",
            "analysis_debug_note": "LLM not configured: missing POLICY_LLM_API_KEY or POLICY_LLM_MODEL.",
        }

    try:
        content_value = str(fallback.get("content_text") or content_text or "")
        if len(content_value) > LONG_POLICY_THRESHOLD and profile["constraints"].get("analysis_focus") == "strategy":
            parsed = analyze_long_policy_document(profile, fallback, content_value)
        else:
            parsed = call_policy_llm(build_policy_messages(profile, fallback))
        validated = validate_policy_analysis(parsed, fallback, profile)
        if not validated["passed"]:
            return {
                **base_result,
                "analysis_mode": "rule",
                "analysis_model": None,
                "analysis_note": humanize_analysis_note(validated["note"], profile["name"]),
                "analysis_debug_note": str(validated["note"] or ""),
            }
        return build_validated_policy_result(
            validated=validated,
            fallback=fallback,
            title=title,
            content_text=content_text,
            profile_name=profile["name"],
            note="已完成交易策略型 AI 解读，可重点查看主体影响、公式费用、责任和时间节点。"
            if profile["constraints"].get("analysis_focus") == "strategy"
            else "已完成 AI 解读，可结合下方问答继续追问具体条款影响。",
        )
    except (HTTPError, URLError, TimeoutError, ValueError, KeyError, json.JSONDecodeError) as exc:
        return {
            **base_result,
            "analysis_mode": "rule",
            "analysis_model": None,
            "analysis_note": f"AI 调用暂未成功，当前已切换为“{profile['name']}”规则解读。",
            "analysis_debug_note": format_llm_exception(exc),
        }


def call_policy_llm(messages: list[dict[str, str]]) -> dict[str, Any]:
    payload = {
        "model": POLICY_LLM_MODEL,
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
        "messages": messages,
    }
    req = request.Request(
        f"{POLICY_LLM_BASE_URL}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {POLICY_LLM_API_KEY}",
        },
        method="POST",
    )
    with request.urlopen(req, timeout=POLICY_LLM_TIMEOUT) as resp:
        response_payload = json.loads(resp.read().decode("utf-8"))
    content = extract_message_content(response_payload)
    return parse_llm_json(content)


def analyze_long_policy_document(profile: dict[str, Any], fallback: dict[str, object], content_text: str) -> dict[str, Any]:
    chunks = select_policy_chunks(content_text)
    chunk_results: list[dict[str, Any]] = []
    total = len(chunks)
    for index, chunk in enumerate(chunks, start=1):
        chunk_result = call_policy_llm(build_policy_chunk_messages(profile, fallback, chunk, index, total))
        chunk_results.append(
            {
                "chunk_index": index,
                "summary": chunk_result.get("summary"),
                "scope_summary": chunk_result.get("scope_summary"),
                "impact_summary": chunk_result.get("impact_summary"),
                "key_points": chunk_result.get("key_points", []),
                "impact_tags": chunk_result.get("impact_tags", []),
                "subject_impacts": chunk_result.get("subject_impacts", []),
                "formula_items": chunk_result.get("formula_items", []),
                "fee_items": chunk_result.get("fee_items", []),
                "responsibility_matrix": chunk_result.get("responsibility_matrix", []),
                "time_nodes": chunk_result.get("time_nodes", []),
                "risk_points": chunk_result.get("risk_points", []),
                "action_suggestions": chunk_result.get("action_suggestions", []),
                "evidence_snippets": chunk_result.get("evidence_snippets", []),
            }
        )
    return call_policy_llm(build_policy_synthesis_messages(profile, fallback, chunk_results))


def select_policy_chunks(content_text: str) -> list[str]:
    chunks = split_policy_chunks(content_text)
    if len(chunks) <= MAX_POLICY_CHUNKS:
        return chunks

    scored = [
        (score_policy_chunk(chunk), index, chunk)
        for index, chunk in enumerate(chunks)
    ]
    required = {0, 1, len(chunks) - 1}
    score_by_index = {index: score for score, index, _ in scored}
    selected_indexes = required | {
        index
        for _, index, _ in sorted(scored, key=lambda item: (item[0], -item[1]), reverse=True)[:MAX_POLICY_CHUNKS]
    }
    while len(selected_indexes) > MAX_POLICY_CHUNKS:
        removable = [index for index in selected_indexes if index not in required]
        selected_indexes.remove(min(removable, key=lambda index: (score_by_index.get(index, 0), -index)))
    selected_indexes = sorted(selected_indexes)
    return [chunks[index] for index in selected_indexes if 0 <= index < len(chunks)]


def split_policy_chunks(content_text: str, chunk_size: int = POLICY_CHUNK_SIZE) -> list[str]:
    paragraphs = [part.strip() for part in re.split(r"\n{2,}", content_text) if part.strip()]
    if not paragraphs:
        return [content_text[:chunk_size]]

    chunks: list[str] = []
    current: list[str] = []
    current_len = 0
    for paragraph in paragraphs:
        if len(paragraph) > chunk_size:
            if current:
                chunks.append("\n\n".join(current))
                current = []
                current_len = 0
            for start in range(0, len(paragraph), chunk_size):
                chunks.append(paragraph[start : start + chunk_size])
            continue
        if current and current_len + len(paragraph) > chunk_size:
            chunks.append("\n\n".join(current))
            current = []
            current_len = 0
        current.append(paragraph)
        current_len += len(paragraph)
    if current:
        chunks.append("\n\n".join(current))
    return chunks


def score_policy_chunk(chunk: str) -> int:
    return sum(chunk.count(keyword) for keyword in CHUNK_PRIORITY_KEYWORDS)


def build_validated_policy_result(
    *,
    validated: dict[str, Any],
    fallback: dict[str, object],
    title: str,
    content_text: str,
    profile_name: str,
    note: str,
) -> dict[str, object]:
    return {
        "summary": validated["summary"],
        "scope_summary": validated["scope_summary"],
        "impact_summary": validated["impact_summary"],
        "key_points_json": json.dumps(validated["key_points"], ensure_ascii=False),
        "impact_tags_json": json.dumps(validated["impact_tags"], ensure_ascii=False),
        "subject_impacts_json": json.dumps(validated.get("subject_impacts", []), ensure_ascii=False),
        "formula_items_json": json.dumps(validated.get("formula_items", []), ensure_ascii=False),
        "fee_items_json": json.dumps(validated.get("fee_items", []), ensure_ascii=False),
        "responsibility_matrix_json": json.dumps(validated.get("responsibility_matrix", []), ensure_ascii=False),
        "time_nodes_json": json.dumps(validated.get("time_nodes", []), ensure_ascii=False),
        "risk_points_json": json.dumps(validated.get("risk_points", []), ensure_ascii=False),
        "action_suggestions_json": json.dumps(validated.get("action_suggestions", []), ensure_ascii=False),
        "content_text": fallback.get("content_text", "") or content_text,
        "title": fallback.get("title", title),
        "issuer": fallback.get("issuer"),
        "region": fallback.get("region"),
        "policy_date": fallback.get("policy_date"),
        "analysis_mode": "llm",
        "analysis_model": POLICY_LLM_MODEL,
        "analysis_profile": profile_name,
        "analysis_note": note,
        "analysis_debug_note": None,
    }


def extract_message_content(payload: dict[str, Any]) -> str:
    choices = payload.get("choices") or []
    if not choices:
        raise ValueError("No completion choices returned")
    message = choices[0].get("message") or {}
    content = message.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        text_parts = [part.get("text", "") for part in content if isinstance(part, dict)]
        return "".join(text_parts)
    raise ValueError("Unsupported completion content")


def parse_llm_json(text: str) -> dict[str, Any]:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            return json.loads(text[start : end + 1])
        raise


def answer_policy_question(document: dict[str, Any], question: str, history: list[dict[str, str]] | None = None) -> dict[str, Any]:
    question = question.strip()
    history = history or []
    if not question:
        return {"answer": "请输入想追问的问题。", "evidence": [], "mode": "rule"}

    if llm_policy_analysis_enabled():
        try:
            payload = {
                "model": POLICY_LLM_MODEL,
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "你是一名电力交易政策解读助手。请基于给定政策正文回答问题。"
                            "输出严格 JSON，字段为 answer 和 evidence。"
                            "answer 用中文，120到220字；evidence 为 1 到 3 条原文依据短句。"
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"政策标题：{document.get('title') or ''}\n"
                            f"政策正文：\n{str(document.get('content_text') or '')[:14000]}\n\n"
                            f"最近对话：\n{format_chat_history(history)}\n\n"
                            f"问题：{question}"
                        ),
                    },
                ],
            }
            req = request.Request(
                f"{POLICY_LLM_BASE_URL}/chat/completions",
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {POLICY_LLM_API_KEY}",
                },
                method="POST",
            )
            with request.urlopen(req, timeout=POLICY_LLM_TIMEOUT) as resp:
                response_payload = json.loads(resp.read().decode("utf-8"))
            content = extract_message_content(response_payload)
            parsed = parse_llm_json(content)
            answer = str(parsed.get("answer") or "").strip()
            evidence = normalize_string_list(parsed.get("evidence"), 3)
            if answer:
                return {"answer": answer, "evidence": evidence, "mode": "llm"}
        except (HTTPError, URLError, TimeoutError, ValueError, KeyError, json.JSONDecodeError):
            pass

    return build_rule_based_answer(document, question)


def generate_workspace_policy_report(documents: list[dict[str, Any]], prefer_llm: bool = True) -> dict[str, Any]:
    if not documents:
        return {
            "report_title": "联动政策解读报告",
            "report_text": "当前未选择可分析的政策文件。",
            "evidence": [],
            "mode": "rule",
        }

    if prefer_llm and llm_policy_analysis_enabled():
        try:
            payload = {
                "model": POLICY_LLM_MODEL,
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "你是一名电力市场交易政策联动解读助手。"
                            "请基于多份规则生成完整、可执行的交易员报告。"
                            "必须输出 JSON，字段：report_title、report_text、evidence。"
                            "report_text 要分段覆盖：联动关系、主体影响（售电公司/新能源主体/发电企业）、"
                            "公式与费用、责任与时间节点、风险与操作建议。"
                            "evidence 输出 3-6 条原文依据短句。"
                        ),
                    },
                    {
                        "role": "user",
                        "content": build_workspace_context(documents),
                    },
                ],
            }
            req = request.Request(
                f"{POLICY_LLM_BASE_URL}/chat/completions",
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {POLICY_LLM_API_KEY}",
                },
                method="POST",
            )
            with request.urlopen(req, timeout=POLICY_LLM_TIMEOUT) as resp:
                response_payload = json.loads(resp.read().decode("utf-8"))
            content = extract_message_content(response_payload)
            parsed = parse_llm_json(content)
            report_title = sanitize_text_line(parsed.get("report_title"), 80) or "联动政策解读报告"
            report_text = sanitize_report_text(parsed.get("report_text"))
            evidence = normalize_string_list(parsed.get("evidence"), 6)
            if report_text:
                return {
                    "report_title": report_title,
                    "report_text": report_text,
                    "evidence": evidence,
                    "mode": "llm",
                }
        except (HTTPError, URLError, TimeoutError, ValueError, KeyError, json.JSONDecodeError):
            pass

    return build_rule_based_workspace_report(documents)


def answer_workspace_policy_question(
    documents: list[dict[str, Any]],
    question: str,
    history: list[dict[str, str]] | None = None,
    report_text: str | None = None,
) -> dict[str, Any]:
    question = question.strip()
    history = history or []
    if not question:
        return {"answer": "请输入你要追问的内容。", "evidence": [], "mode": "rule", "related_policies": []}

    if llm_policy_analysis_enabled():
        try:
            payload = {
                "model": POLICY_LLM_MODEL,
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "你是一名电力市场多文件政策问答助手。"
                            "请基于给定的联动报告和多份政策内容回答问题。"
                            "输出 JSON 字段：answer、evidence、related_policies。"
                            "answer 使用中文并保持具体；evidence 给 1-4 条依据；"
                            "related_policies 填写最相关政策 ID 列表。"
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"联动报告：\n{sanitize_report_text(report_text)[:3000] if report_text else '暂无'}\n\n"
                            f"多文件上下文：\n{build_workspace_context(documents)}\n\n"
                            f"最近对话：\n{format_chat_history(history)}\n\n"
                            f"问题：{question}"
                        ),
                    },
                ],
            }
            req = request.Request(
                f"{POLICY_LLM_BASE_URL}/chat/completions",
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {POLICY_LLM_API_KEY}",
                },
                method="POST",
            )
            with request.urlopen(req, timeout=POLICY_LLM_TIMEOUT) as resp:
                response_payload = json.loads(resp.read().decode("utf-8"))
            content = extract_message_content(response_payload)
            parsed = parse_llm_json(content)
            answer = sanitize_report_text(parsed.get("answer"))
            evidence = normalize_string_list(parsed.get("evidence"), 4)
            related_ids = normalize_int_list(parsed.get("related_policies"), [doc.get("id") for doc in documents])
            if answer:
                return {
                    "answer": answer,
                    "evidence": evidence,
                    "mode": "llm",
                    "related_policies": related_ids,
                }
        except (HTTPError, URLError, TimeoutError, ValueError, KeyError, json.JSONDecodeError):
            pass

    return build_rule_based_workspace_answer(documents, question)


def build_rule_based_answer(document: dict[str, Any], question: str) -> dict[str, Any]:
    content_text = str(document.get("content_text") or "")
    summary = str(document.get("summary") or "")
    impact_summary = str(document.get("impact_summary") or "")
    scope_summary = str(document.get("scope_summary") or "")
    key_points = normalize_string_list(document.get("key_points") or [], 3)
    paragraphs = [part.strip() for part in re.split(r"\n{2,}", content_text) if part.strip()]
    keywords = extract_question_keywords(question)
    scored: list[tuple[int, str]] = []
    for paragraph in paragraphs:
        score = sum(paragraph.count(keyword) for keyword in keywords)
        if score > 0:
            scored.append((score, paragraph))
    scored.sort(key=lambda item: item[0], reverse=True)
    evidence = [text[:70] for _, text in scored[:2]]

    answer_parts = [part for part in [summary, impact_summary, scope_summary] if part]
    if key_points:
        answer_parts.append("你可以重点关注：" + "；".join(key_points[:2]) + "。")
    if evidence:
        answer_parts.append("与问题最相关的原文依据主要在：" + "；".join(evidence) + "。")
    if not answer_parts:
        answer_parts.append("当前已定位到这份政策，但还没有提取到足够的规则摘要，建议先查看正文摘录后再追问更具体的问题。")
    return {"answer": " ".join(answer_parts)[:260], "evidence": evidence, "mode": "rule"}


def build_rule_based_workspace_report(documents: list[dict[str, Any]]) -> dict[str, Any]:
    lines = ["联动关系与总体判断："]
    evidence: list[str] = []
    for index, document in enumerate(documents, start=1):
        title = str(document.get("title") or f"文件{index}")
        summary = str(document.get("summary") or "暂无摘要")
        impact = str(document.get("impact_summary") or "暂无交易影响摘要")
        lines.append(f"{index}. {title}：{summary} {impact}".strip())
        evidence.extend(normalize_string_list(document.get("key_points"), 2))

    lines.append("\n主体交易影响：")
    lines.append(join_workspace_records(documents, "subject_impacts", ["subject", "impact", "strategy_relevance"]))
    lines.append("\n公式与费用：")
    lines.append(join_workspace_records(documents, "formula_items", ["name", "formula_or_rule", "applies_to"]))
    lines.append(join_workspace_records(documents, "fee_items", ["fee_name", "trigger_condition", "calculation_basis"]))
    lines.append("\n责任与时间节点：")
    lines.append(join_workspace_records(documents, "responsibility_matrix", ["responsible_party", "responsibility", "consequence"]))
    lines.append(join_workspace_records(documents, "time_nodes", ["stage", "subject", "time_requirement"]))
    lines.append("\n风险与操作建议：")
    lines.append(join_workspace_records(documents, "risk_points", ["subject", "risk", "strategy_response"]))
    lines.append(join_workspace_records(documents, "action_suggestions", ["subject", "suggestion", "basis"]))

    report_text = "\n".join(part for part in lines if part and part.strip())
    return {
        "report_title": "联动政策解读报告（规则回退）",
        "report_text": sanitize_report_text(report_text),
        "evidence": evidence[:6],
        "mode": "rule",
    }


def build_rule_based_workspace_answer(documents: list[dict[str, Any]], question: str) -> dict[str, Any]:
    keywords = extract_question_keywords(question)
    candidates: list[tuple[int, int, str]] = []
    for document in documents:
        policy_id = int(document.get("id") or 0)
        title = str(document.get("title") or "")
        combined = "\n".join(
            [
                title,
                str(document.get("summary") or ""),
                str(document.get("impact_summary") or ""),
                "；".join(normalize_string_list(document.get("key_points"), 5)),
                serialize_workspace_records(document.get("subject_impacts"), ["subject", "impact", "strategy_relevance"]),
                serialize_workspace_records(document.get("responsibility_matrix"), ["responsible_party", "responsibility", "consequence"]),
                serialize_workspace_records(document.get("time_nodes"), ["stage", "subject", "time_requirement"]),
                str(document.get("content_text") or "")[:1200],
            ]
        )
        score = sum(combined.count(keyword) for keyword in keywords)
        if score > 0:
            candidates.append((score, policy_id, combined[:220]))
    candidates.sort(key=lambda item: item[0], reverse=True)
    if not candidates:
        fallback_parts = []
        for document in documents[:2]:
            title = str(document.get("title") or "未命名文件")
            impact = str(document.get("impact_summary") or document.get("summary") or "暂无可用摘要")
            fallback_parts.append(f"{title}：{impact}")
        return {
            "answer": "当前基于已选文件可先参考：" + "；".join(fallback_parts),
            "evidence": fallback_parts,
            "mode": "rule",
            "related_policies": [],
        }

    related = [policy_id for _, policy_id, _ in candidates[:3] if policy_id]
    evidence = [text for _, _, text in candidates[:3]]
    answer = "结合已选规则，最相关的约束集中在：" + "；".join(evidence[:2])
    return {
        "answer": sanitize_report_text(answer),
        "evidence": evidence[:4],
        "mode": "rule",
        "related_policies": related,
    }


def build_workspace_context(documents: list[dict[str, Any]]) -> str:
    blocks: list[str] = []
    for index, document in enumerate(documents, start=1):
        block_lines = [
            f"[文件{index}]",
            f"id: {document.get('id')}",
            f"title: {document.get('title') or ''}",
            f"policy_date: {document.get('policy_date') or ''}",
            f"issuer: {document.get('issuer') or ''}",
            f"analysis_mode: {document.get('analysis_mode') or ''}",
            f"summary: {document.get('summary') or ''}",
            f"scope_summary: {document.get('scope_summary') or ''}",
            f"impact_summary: {document.get('impact_summary') or ''}",
            f"key_points: {'；'.join(normalize_string_list(document.get('key_points'), 7))}",
            f"impact_tags: {'；'.join(normalize_string_list(document.get('impact_tags'), 8))}",
            f"subject_impacts: {serialize_workspace_records(document.get('subject_impacts'), ['subject', 'impact', 'strategy_relevance'])}",
            f"formula_items: {serialize_workspace_records(document.get('formula_items'), ['name', 'formula_or_rule', 'applies_to'])}",
            f"fee_items: {serialize_workspace_records(document.get('fee_items'), ['fee_name', 'trigger_condition', 'calculation_basis'])}",
            f"responsibility_matrix: {serialize_workspace_records(document.get('responsibility_matrix'), ['responsible_party', 'responsibility', 'consequence'])}",
            f"time_nodes: {serialize_workspace_records(document.get('time_nodes'), ['stage', 'subject', 'time_requirement'])}",
            f"risk_points: {serialize_workspace_records(document.get('risk_points'), ['subject', 'risk', 'strategy_response'])}",
            f"action_suggestions: {serialize_workspace_records(document.get('action_suggestions'), ['subject', 'suggestion', 'basis'])}",
            f"content_excerpt: {str(document.get('content_text') or '')[:WORKSPACE_DOC_CONTENT_LIMIT]}",
        ]
        blocks.append("\n".join(block_lines))
    return "\n\n".join(blocks)[:WORKSPACE_TOTAL_CONTEXT_LIMIT]


def serialize_workspace_records(value: Any, preferred_keys: list[str]) -> str:
    if not isinstance(value, list):
        return ""
    parts: list[str] = []
    for item in value[:5]:
        if isinstance(item, dict):
            values = [str(item.get(key) or "").strip() for key in preferred_keys if str(item.get(key) or "").strip()]
            compact = " / ".join(values)
            if compact:
                parts.append(compact)
        else:
            text = str(item).strip()
            if text:
                parts.append(text)
    return "；".join(parts)


def join_workspace_records(documents: list[dict[str, Any]], field_name: str, keys: list[str]) -> str:
    rows: list[str] = []
    for document in documents:
        title = str(document.get("title") or "未命名文件")
        content = serialize_workspace_records(document.get(field_name), keys)
        if content:
            rows.append(f"{title}：{content}")
    return "\n".join(rows) if rows else "暂无明确条款。"


def sanitize_report_text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).replace("\r", "\n")
    lines = [line.strip() for line in text.splitlines()]
    merged: list[str] = []
    for line in lines:
        if not line:
            if merged and merged[-1] != "":
                merged.append("")
            continue
        merged.append(line)
    return "\n".join(merged).strip()[:5000]


def sanitize_text_line(value: Any, limit: int) -> str:
    text = str(value or "").replace("\r", " ").replace("\n", " ").strip()
    return " ".join(text.split())[:limit]


def normalize_int_list(value: Any, allowed_ids: list[Any]) -> list[int]:
    allowed_set = {int(item) for item in allowed_ids if isinstance(item, int) or str(item).isdigit()}
    if not isinstance(value, list):
        return []
    cleaned: list[int] = []
    for item in value:
        if isinstance(item, int):
            item_id = item
        elif str(item).isdigit():
            item_id = int(str(item))
        else:
            continue
        if item_id not in allowed_set or item_id in cleaned:
            continue
        cleaned.append(item_id)
    return cleaned


def extract_question_keywords(question: str) -> list[str]:
    raw_tokens = re.findall(r"[\u4e00-\u9fffA-Za-z0-9]{2,12}", question)
    stopwords = {
        "这份",
        "政策",
        "文件",
        "规则",
        "什么",
        "哪些",
        "怎么",
        "如何",
        "是否",
        "对于",
        "关于",
        "影响",
        "规定",
        "要求",
        "可以",
        "一个",
        "这个",
    }
    keywords: list[str] = []
    for token in raw_tokens:
        if token in stopwords or len(token) < 2:
            continue
        if token not in keywords:
            keywords.append(token)
    return keywords[:6] or ["交易", "市场"]


def normalize_string_list(value: Any, limit: int) -> list[str]:
    if not isinstance(value, list):
        return []
    cleaned = [str(item).strip() for item in value if str(item).strip()]
    return cleaned[:limit]


def format_chat_history(history: list[dict[str, str]]) -> str:
    if not history:
        return "暂无历史对话"
    lines: list[str] = []
    for item in history[-6:]:
        role = "用户" if item.get("role") == "user" else "助手"
        content = str(item.get("content") or "").strip()
        if not content:
            continue
        lines.append(f"{role}：{content}")
    return "\n".join(lines) if lines else "暂无历史对话"


def humanize_analysis_note(note: str | None, profile_name: str | None = None) -> str | None:
    if not note:
        return None
    if "validation failed" in note:
        return f"AI 输出未通过校验，当前已切换为“{profile_name or '默认'}”规则解读。"
    if "validation passed" in note:
        return "AI 解读已通过校验，可继续结合下方问答深入追问。"
    if "LLM request failed" in note:
        return f"AI 调用暂未成功，当前已切换为“{profile_name or '默认'}”规则解读。"
    if "LLM not configured" in note:
        return f"当前未配置大模型，正在使用“{profile_name or '默认'}”规则解读。"
    return note


def format_llm_exception(exc: Exception) -> str:
    if isinstance(exc, HTTPError):
        body_text = read_http_error_body(exc)
        body_text = " ".join(body_text.split())
        if len(body_text) > 240:
            body_text = body_text[:240] + "..."
        detail = f"HTTP {exc.code} {exc.reason}"
        if body_text:
            detail = f"{detail}; body={body_text}"
        return f"LLM request failed: {detail}"
    if isinstance(exc, URLError):
        return f"LLM request failed: network error: {exc.reason}"
    if isinstance(exc, TimeoutError):
        return "LLM request failed: request timeout."
    if isinstance(exc, json.JSONDecodeError):
        return f"LLM request failed: invalid JSON response: {exc.msg}"
    return f"LLM request failed: {exc.__class__.__name__}: {exc}"


def read_http_error_body(exc: HTTPError) -> str:
    try:
        return exc.read().decode("utf-8", errors="ignore").strip()
    except Exception:
        return ""


def classify_http_error(status_code: int, body_text: str) -> str:
    lowered = body_text.lower()
    if status_code in (401, 403):
        return "auth_failed"
    if status_code == 429:
        return "rate_limited"
    if status_code == 404:
        return "model_not_found"
    if status_code == 400 and ("model" in lowered and ("not found" in lowered or "invalid" in lowered)):
        return "model_not_found"
    if status_code >= 500:
        return "provider_error"
    return "request_failed"


def summarize_http_error(status_code: int, category: str) -> str:
    if category == "auth_failed":
        return f"模型接口认证失败（HTTP {status_code}）。"
    if category == "model_not_found":
        return f"模型名称不可用或接口路径不匹配（HTTP {status_code}）。"
    if category == "rate_limited":
        return "模型接口触发限流。"
    if category == "provider_error":
        return f"模型服务端异常（HTTP {status_code}）。"
    return f"模型接口请求失败（HTTP {status_code}）。"


def format_http_error_detail(exc: HTTPError, body_text: str) -> str:
    compact = " ".join((body_text or "").split())
    if len(compact) > 260:
        compact = compact[:260] + "..."
    detail = f"HTTP {exc.code} {exc.reason}"
    if compact:
        detail = f"{detail}; body={compact}"
    return detail
