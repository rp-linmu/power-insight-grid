import re
from datetime import datetime


DATE_PATTERNS = [
    re.compile(r"(\d{4}-\d{2}-\d{2})"),
    re.compile(r"(\d{8})"),
]


def normalize_date(raw: str | None) -> str | None:
    if not raw:
        return None

    text = raw.strip()
    for pattern in DATE_PATTERNS:
        match = pattern.search(text)
        if not match:
            continue
        value = match.group(1)
        try:
            if len(value) == 8:
                return datetime.strptime(value, "%Y%m%d").strftime("%Y-%m-%d")
            return datetime.strptime(value, "%Y-%m-%d").strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def resolve_effective_date(file_name: str, sheet_name: str, explicit_date: str | None = None) -> tuple[str | None, str]:
    external_date = normalize_date(file_name)
    sheet_date = normalize_date(sheet_name)
    actual_date = normalize_date(explicit_date)

    effective_date = actual_date or sheet_date or external_date
    parts = []

    if external_date:
        parts.append(f"外部文件名日期={external_date}")
    if sheet_date:
        parts.append(f"sheet日期={sheet_date}")
    if actual_date:
        parts.append(f"表内日期={actual_date}")

    if actual_date:
        parts.append("以表内日期为准")
    elif sheet_date:
        parts.append("未发现独立表内日期，按sheet日期作为业务日期")
    elif external_date:
        parts.append("未发现sheet日期，暂按外部文件名日期作为业务日期")
    else:
        parts.append("未识别到日期")

    if external_date and sheet_date and external_date != sheet_date:
        parts.append("检测到外部文件名日期与sheet日期不一致，已按sheet或表内日期处理")

    return effective_date, "；".join(parts)
