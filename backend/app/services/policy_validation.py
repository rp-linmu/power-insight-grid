import json
from typing import Any


GENERIC_PHRASES = (
    "通常意味着",
    "根据经验",
    "大概率",
    "预计会",
    "可能将会",
)

STRUCTURED_FIELD_LIMITS = {
    "subject_impacts": {"limit": 9, "item_limit": 180},
    "formula_items": {"limit": 12, "item_limit": 220},
    "fee_items": {"limit": 12, "item_limit": 220},
    "responsibility_matrix": {"limit": 12, "item_limit": 180},
    "time_nodes": {"limit": 12, "item_limit": 160},
    "risk_points": {"limit": 9, "item_limit": 180},
    "action_suggestions": {"limit": 9, "item_limit": 180},
}


def validate_policy_analysis(
    payload: dict[str, Any],
    fallback: dict[str, object],
    profile: dict[str, Any],
) -> dict[str, object]:
    constraints = profile["constraints"]
    fields = constraints["fields"]
    allowed_tags = set(constraints["allowed_impact_tags"])
    issues: list[str] = []
    warnings: list[str] = []

    summary = sanitize_text(payload.get("summary"), fields["summary"]["max_chars"])
    scope_summary = sanitize_text(payload.get("scope_summary"), fields["scope_summary"]["max_chars"])
    impact_summary = sanitize_text(payload.get("impact_summary"), fields["impact_summary"]["max_chars"])
    key_points = sanitize_list(payload.get("key_points"), fields["key_points"]["max_items"], fields["key_points"]["max_chars"])
    impact_tags = sanitize_tags(payload.get("impact_tags"), allowed_tags)
    evidence_snippets = sanitize_list(payload.get("evidence_snippets"), 4, 60)
    structured_fields = {
        name: sanitize_record_list(
            payload.get(name),
            config["limit"],
            config["item_limit"],
        )
        for name, config in STRUCTURED_FIELD_LIMITS.items()
    }

    if not summary:
        issues.append("missing summary")
    if not scope_summary:
        issues.append("missing scope_summary")
    if not impact_summary:
        issues.append("missing impact_summary")
    if len(key_points) < fields["key_points"]["min_items"]:
        issues.append("insufficient key_points")
    if not impact_tags:
        issues.append("missing impact_tags")
    if len(evidence_snippets) < constraints.get("required_evidence_count", 2):
        issues.append("insufficient evidence_snippets")
    required_structured_fields = [field for field in constraints.get("required_structured_fields", []) if field in STRUCTURED_FIELD_LIMITS]
    if required_structured_fields:
        resolved_fields = [field for field in required_structured_fields if structured_fields.get(field)]
        missing_fields = [field for field in required_structured_fields if field not in resolved_fields]
        min_required_count = constraints.get("required_structured_min_count")
        if isinstance(min_required_count, int):
            target_required_count = max(0, min(min_required_count, len(required_structured_fields)))
        else:
            target_required_count = len(required_structured_fields)
        if len(resolved_fields) < target_required_count:
            issues.extend(f"missing {field}" for field in missing_fields)
        elif missing_fields:
            warnings.append(f"missing {', '.join(missing_fields)}")

    for value in (summary, scope_summary, impact_summary, *key_points):
        if contains_generic_phrase(value):
            issues.append("contains speculative language")
            break

    fallback_key_points = parse_json_list(fallback.get("key_points_json"))
    fallback_tags = parse_json_list(fallback.get("impact_tags_json"))
    fallback_summary = sanitize_text(fallback.get("summary"), fields["summary"]["max_chars"])
    fallback_scope = sanitize_text(fallback.get("scope_summary"), fields["scope_summary"]["max_chars"])
    fallback_impact = sanitize_text(fallback.get("impact_summary"), fields["impact_summary"]["max_chars"])
    fallback_structured_fields = {
        name: parse_json_records(fallback.get(f"{name}_json"))
        for name in STRUCTURED_FIELD_LIMITS
    }

    result = {
        "passed": not issues,
        "summary": summary or fallback_summary,
        "scope_summary": scope_summary or fallback_scope,
        "impact_summary": impact_summary or fallback_impact,
        "key_points": key_points or fallback_key_points,
        "impact_tags": impact_tags or fallback_tags,
        "note": build_validation_note(profile["name"], issues, warnings, evidence_snippets),
    }
    for name in STRUCTURED_FIELD_LIMITS:
        result[name] = structured_fields[name] or fallback_structured_fields[name]
    return result


def sanitize_text(value: Any, limit: int) -> str:
    text = str(value or "").replace("\r", " ").replace("\n", " ").strip()
    text = " ".join(text.split())
    return text[:limit].strip()


def sanitize_list(value: Any, limit: int, item_limit: int) -> list[str]:
    if not isinstance(value, list):
        return []
    cleaned: list[str] = []
    for item in value:
        text = sanitize_text(item, item_limit)
        if not text or text in cleaned:
            continue
        cleaned.append(text)
        if len(cleaned) >= limit:
            break
    return cleaned


def sanitize_record_list(value: Any, limit: int, item_limit: int) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []
    cleaned: list[dict[str, str]] = []
    for item in value:
        if isinstance(item, dict):
            record = {
                str(key).strip(): sanitize_text(raw_value, item_limit)
                for key, raw_value in item.items()
                if str(key).strip() and sanitize_text(raw_value, item_limit)
            }
        else:
            text = sanitize_text(item, item_limit)
            record = {"text": text} if text else {}
        if not record or record in cleaned:
            continue
        cleaned.append(record)
        if len(cleaned) >= limit:
            break
    return cleaned


def sanitize_tags(value: Any, allowed_tags: set[str]) -> list[str]:
    cleaned = sanitize_list(value, len(allowed_tags), 20)
    return [item for item in cleaned if item in allowed_tags]


def contains_generic_phrase(text: str) -> bool:
    return any(phrase in text for phrase in GENERIC_PHRASES)


def parse_json_list(value: object) -> list[str]:
    if not value:
        return []
    try:
        loaded = json.loads(str(value))
    except json.JSONDecodeError:
        return []
    if not isinstance(loaded, list):
        return []
    return [str(item).strip() for item in loaded if str(item).strip()]


def parse_json_records(value: object) -> list[dict[str, str]]:
    if not value:
        return []
    try:
        loaded = json.loads(str(value))
    except json.JSONDecodeError:
        return []
    if not isinstance(loaded, list):
        return []
    return sanitize_record_list(loaded, 20, 220)


def build_validation_note(profile_name: str, issues: list[str], warnings: list[str], evidence_snippets: list[str]) -> str:
    if issues:
        return f"Profile {profile_name} validation failed: {', '.join(issues)}."
    if warnings:
        return f"Profile {profile_name} validation passed with warnings: {', '.join(warnings)}."
    evidence_note = " | ".join(evidence_snippets[:2])
    return f"Profile {profile_name} validation passed. Evidence: {evidence_note}"
