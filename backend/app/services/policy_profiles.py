import json
from functools import lru_cache
from pathlib import Path
from typing import Any


PROFILE_DIR = Path(__file__).resolve().parents[1] / "policy_profiles"


@lru_cache(maxsize=1)
def load_policy_profiles() -> list[dict[str, Any]]:
    profiles: list[dict[str, Any]] = []
    for path in sorted(PROFILE_DIR.glob("*.json")):
        with path.open("r", encoding="utf-8") as handle:
            profiles.append(json.load(handle))
    if not profiles:
        raise FileNotFoundError(f"No policy profiles found in {PROFILE_DIR}")
    return profiles


def select_policy_profile(document: dict[str, object]) -> dict[str, Any]:
    profiles = load_policy_profiles()
    title = str(document.get("title") or "")
    issuer = str(document.get("issuer") or "")
    region = str(document.get("region") or "")
    content_text = str(document.get("content_text") or "")
    best_profile = profiles[0]
    best_score = -1

    for profile in profiles:
        score = score_profile(profile, title, issuer, region, content_text)
        if score > best_score:
            best_score = score
            best_profile = profile
    return best_profile


def score_profile(profile: dict[str, Any], title: str, issuer: str, region: str, content_text: str) -> int:
    match = profile.get("match", {})
    haystack = "\n".join([title, issuer, region, content_text[:5000]])
    score = 0

    for keyword in match.get("title_keywords", []):
        if keyword and keyword in title:
            score += 4
    for keyword in match.get("issuer_keywords", []):
        if keyword and keyword in issuer:
            score += 3
    for keyword in match.get("region_keywords", []):
        if keyword and keyword in region:
            score += 3
    for keyword in match.get("content_keywords", []):
        if keyword and keyword in haystack:
            score += 1
    return score


def build_policy_messages(profile: dict[str, Any], document: dict[str, object]) -> list[dict[str, str]]:
    return build_policy_messages_for_content(
        profile,
        document,
        str(document.get("content_text") or "")[:14000],
        task_note="请分析以下政策文件，并输出 JSON。",
    )


def build_policy_messages_for_content(
    profile: dict[str, Any],
    document: dict[str, object],
    content_text: str,
    task_note: str,
) -> list[dict[str, str]]:
    constraints = profile["constraints"]
    fields = constraints["fields"]
    allowed_tags = "、".join(constraints["allowed_impact_tags"])
    focus_topics = "、".join(constraints["focus_topics"])
    forbidden = "\n".join(f"- {item}" for item in constraints["forbidden"])
    evidence_count = constraints.get("required_evidence_count", 2)
    strategy_contract = build_strategy_contract(constraints)

    system_prompt = f"""你是一名电力市场政策分析助手，负责输出严格、可核对的结构化研判结果。

当前解读模板：{profile['name']}
适用说明：{profile['description']}

解读任务要求：
1. 先识别文件类型、适用对象和生效层级，再总结影响。
2. 只根据正文内容输出，不得补充原文未明确的市场规则、公式或执行口径。
3. 如果原文只表达方向性要求，不得写成已经落地的实施细则。
4. 所有关键结论必须能在原文中找到依据。
5. 优先从这些维度分析：{focus_topics}
6. 如果涉及交易策略影响，必须区分售电公司、新能源主体、发电企业三类主体；没有原文依据时写“未明确”，不要推断。

禁止事项：
{forbidden}

允许使用的 impact_tags：
{allowed_tags}

必须输出 JSON，不要输出 Markdown，不要补充额外说明。

输出字段要求：
- summary: {fields['summary']['max_chars']}字以内，概括文件目的、适用主题和关键变化
- scope_summary: {fields['scope_summary']['max_chars']}字以内，明确适用对象、区域、市场范围
- impact_summary: {fields['impact_summary']['max_chars']}字以内，说明对交易流程或市场环节的影响
- key_points: {fields['key_points']['min_items']}-{fields['key_points']['max_items']}条，每条不超过{fields['key_points']['max_chars']}字
- impact_tags: 只能从允许标签中选择
- evidence_snippets: 至少{evidence_count}条原文依据短句，每条不超过60字
{strategy_contract}
"""

    user_prompt = f"""{task_note}

政策标题：
{document.get('title') or ''}

发文机构：
{document.get('issuer') or ''}

地区：
{document.get('region') or ''}

日期：
{document.get('policy_date') or ''}

政策正文：
{content_text}
"""

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]


def build_policy_chunk_messages(
    profile: dict[str, Any],
    document: dict[str, object],
    chunk_text: str,
    chunk_index: int,
    chunk_total: int,
) -> list[dict[str, str]]:
    return build_policy_messages_for_content(
        profile,
        document,
        chunk_text,
        task_note=(
            f"这是长篇政策文件的第 {chunk_index}/{chunk_total} 个片段。"
            "请只抽取本片段中明确出现的规则、公式、费用、责任、时间节点和交易策略影响；"
            "不要概括全文，不要引用本片段之外的信息。"
        ),
    )


def build_policy_synthesis_messages(
    profile: dict[str, Any],
    document: dict[str, object],
    chunk_results: list[dict[str, Any]],
) -> list[dict[str, str]]:
    compact_results = json.dumps(chunk_results, ensure_ascii=False)[:18000]
    return build_policy_messages_for_content(
        profile,
        document,
        compact_results,
        task_note=(
            "下面是长篇政策文件分片抽取后的 JSON 结果。"
            "请只基于这些分片结果合成最终 JSON，合并重复项，保留证据，不得新增未出现的公式、费用项、责任主体或时间节点。"
        ),
    )


def build_strategy_contract(constraints: dict[str, Any]) -> str:
    if constraints.get("analysis_focus") != "strategy":
        return ""
    subjects = "、".join(constraints.get("target_subjects", ["售电公司", "新能源主体", "发电企业"]))
    return f"""
- subject_impacts: 数组；每项包含 subject、impact、strategy_relevance、evidence。subject 只能使用或明确映射到：{subjects}
- formula_items: 数组；每项包含 name、formula_or_rule、applies_to、strategy_explanation、evidence。原文没有公式时可为空数组
- fee_items: 数组；每项包含 fee_name、payer_or_receiver、trigger_condition、calculation_basis、strategy_explanation、evidence。原文没有费用项时可为空数组
- responsibility_matrix: 数组；每项包含 responsible_party、responsibility、trigger_condition、consequence、evidence
- time_nodes: 数组；每项包含 stage、subject、time_requirement、action_required、evidence
- risk_points: 数组；每项包含 subject、risk, strategy_response、evidence
- action_suggestions: 数组；每项包含 subject、suggestion、basis、evidence。suggestion 必须是基于规则的交易关注点，不得承诺收益
"""
