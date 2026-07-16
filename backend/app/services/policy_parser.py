import json
import re
from pathlib import Path

from pypdf import PdfReader

from app.services.date_rules import normalize_date


DATE_CN_PATTERN = re.compile(r"(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日")
HEADING_PATTERN = re.compile(r"^([一二三四五六七八九十]+、|\d+(\.\d+)*\s+|（[一二三四五六七八九十]+）)")
WHITESPACE_PATTERN = re.compile(r"[ \t]+")
PARAGRAPH_SPACE_PATTERN = re.compile(r"\n{3,}")
CHINESE_SPACE_PATTERN = re.compile(r"(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])")
PAGE_NUMBER_PATTERN = re.compile(r"^[—\-]+\s*\d+\s*[—\-]+$")

IMPACT_TAG_RULES = [
    ("现货交易", ["现货", "日前", "实时", "报量报价", "出清"]),
    ("中长期交易", ["中长期", "年度交易", "月度交易", "双边协商"]),
    ("新能源", ["新能源", "风电", "光伏", "太阳能", "分布式"]),
    ("申报要求", ["申报", "报价", "申报曲线", "申报电量"]),
    ("结算考核", ["结算", "偏差", "考核", "不平衡资金"]),
    ("市场准入", ["准入", "经营主体", "注册", "入市"]),
]

SCOPE_RULES = [
    ("发电侧主体", ["发电企业", "发电侧", "机组", "场站"]),
    ("用户侧主体", ["用户", "工商业用户", "售电公司", "零售"]),
    ("新能源主体", ["新能源", "风电", "光伏", "分布式"]),
    ("交易机构与调度机构", ["交易中心", "调度", "电网企业"]),
]


def parse_policy_document(file_path: Path) -> dict[str, object]:
    content_text = extract_pdf_text(file_path)
    title = infer_title(file_path, content_text)
    issuer = infer_issuer(title, content_text)
    region = infer_region(title, content_text)
    policy_date = infer_policy_date(file_path, content_text)
    summary = build_summary(title, content_text)
    key_points = extract_key_points(content_text)
    scope_summary = build_scope_summary(content_text)
    impact_tags = infer_impact_tags(content_text, title)
    impact_summary = build_impact_summary(impact_tags, content_text)

    return {
        "title": title,
        "issuer": issuer,
        "region": region,
        "policy_date": policy_date,
        "summary": summary,
        "scope_summary": scope_summary,
        "impact_summary": impact_summary,
        "key_points_json": json.dumps(key_points, ensure_ascii=False),
        "impact_tags_json": json.dumps(impact_tags, ensure_ascii=False),
        "content_text": content_text,
    }


def extract_pdf_text(file_path: Path) -> str:
    reader = PdfReader(str(file_path))
    pages: list[str] = []
    for page in reader.pages:
        raw_text = page.extract_text() or ""
        if raw_text.strip():
            pages.append(raw_text)
    return normalize_policy_text("\n\n".join(pages))


def normalize_policy_text(text: str) -> str:
    lines = [WHITESPACE_PATTERN.sub(" ", line).strip() for line in text.splitlines()]
    cleaned_lines: list[str] = []
    for line in lines:
        line = CHINESE_SPACE_PATTERN.sub("", line)
        if not line:
            cleaned_lines.append("")
            continue
        if PAGE_NUMBER_PATTERN.match(line):
            continue
        if cleaned_lines and line == cleaned_lines[-1]:
            continue
        cleaned_lines.append(line)
    cleaned = "\n".join(cleaned_lines)
    return PARAGRAPH_SPACE_PATTERN.sub("\n\n", cleaned).strip()


def infer_title(file_path: Path, content_text: str) -> str:
    lines = [line.strip() for line in content_text.splitlines()[:10] if line.strip()]
    for index, line in enumerate(lines):
        next_line = lines[index + 1] if index + 1 < len(lines) else ""
        if "关于" in line and any(keyword in next_line for keyword in ["通知", "细则", "规则", "方案"]):
            return f"{line}{next_line}".replace(" ", "")
        if "关于" in line or "细则" in line or "通知" in line or "规则" in line:
            prefix = lines[index - 1] if index > 0 and len(lines[index - 1]) <= 20 else ""
            if prefix and prefix not in line and "局" in prefix:
                return f"{prefix}{line}".replace(" ", "")
            return line.replace(" ", "")
    return file_path.stem


def infer_issuer(title: str, content_text: str) -> str | None:
    header_lines = [line.replace(" ", "") for line in content_text.splitlines()[:6] if line.strip()]
    issuer_lines = [line for line in header_lines if any(token in line for token in ["局", "委", "中心", "监管局", "交易中心"])]
    if issuer_lines:
        compact = " / ".join(dict.fromkeys(issuer_lines[:2]))
        if len(compact) <= 60:
            return compact
    if "广东省能源局" in title and "南方监管局" in title:
        return "广东省能源局 / 国家能源局南方监管局"
    if "广东省能源局" in title:
        return "广东省能源局"
    return None


def infer_region(title: str, content_text: str) -> str | None:
    text = f"{title}\n{content_text[:300]}"
    if "广东" in text:
        return "广东"
    if "南方区域" in text:
        return "南方区域"
    return None


def infer_policy_date(file_path: Path, content_text: str) -> str | None:
    match = DATE_CN_PATTERN.search(content_text[:1000])
    if match:
        year, month, day = match.groups()
        return f"{year}-{int(month):02d}-{int(day):02d}"
    code_match = re.search(r"〔(\d{4})〕", content_text[:500])
    if code_match:
        return f"{code_match.group(1)}-01-01"
    return normalize_date(file_path.name)


def build_summary(title: str, content_text: str) -> str:
    preferred_keywords = ["为贯彻落实", "建立健全", "平稳推进", "组织做好", "适用于", "参与电力市场"]
    for keyword in preferred_keywords:
        index = content_text.find(keyword)
        if index >= 0:
            return shorten_text(content_text[index : index + 180], 140)
    paragraphs = get_paragraphs(content_text)
    candidates = [
        paragraph
        for paragraph in paragraphs
        if len(paragraph) >= 38 and not paragraph.startswith(title[:8]) and paragraph not in title and "附件" not in paragraph[:6]
    ]
    if not candidates:
        return f"{title}已完成正文抽取，待进一步补充摘要规则。"
    text = candidates[0]
    return shorten_text(text, 140)


def extract_key_points(content_text: str) -> list[str]:
    paragraphs = get_paragraphs(content_text)
    key_points: list[str] = []
    for paragraph in paragraphs:
        if len(paragraph) < 20:
            continue
        if HEADING_PATTERN.match(paragraph) or any(
            keyword in paragraph
            for keyword in ["市场规模", "准入", "报量报价", "结算", "考核", "适用", "交易方式", "新能源"]
        ):
            key_points.append(shorten_text(paragraph, 110))
        if len(key_points) >= 5:
            break
    if not key_points:
        key_points = [shorten_text(paragraph, 110) for paragraph in paragraphs[:3]]
    return key_points


def build_scope_summary(content_text: str) -> str:
    matched = [label for label, keywords in SCOPE_RULES if any(keyword in content_text for keyword in keywords)]
    if matched:
        return f"重点适用于{ '、'.join(matched[:4]) }。"
    return "当前已完成正文解析，适用对象可结合核心条款继续补充。"


def infer_impact_tags(content_text: str, title: str) -> list[str]:
    combined = f"{title}\n{content_text}"
    tags = [label for label, keywords in IMPACT_TAG_RULES if any(keyword in combined for keyword in keywords)]
    return tags[:6]


def build_impact_summary(impact_tags: list[str], content_text: str) -> str:
    if impact_tags:
        prefix = f"该文件主要影响{ '、'.join(impact_tags[:4]) }。"
    else:
        prefix = "该文件对电力交易规则有直接影响。"

    paragraphs = get_paragraphs(content_text)
    impact_paragraph = next(
        (
            paragraph
            for paragraph in paragraphs
            if any(keyword in paragraph for keyword in ["申报", "出清", "结算", "偏差", "报量报价", "市场交易"])
        ),
        "",
    )
    if impact_paragraph:
        return f"{prefix}{shorten_text(impact_paragraph, 120)}"
    return prefix


def get_paragraphs(content_text: str) -> list[str]:
    return [paragraph.strip() for paragraph in content_text.split("\n\n") if paragraph.strip()]


def shorten_text(text: str, limit: int) -> str:
    compact = re.sub(r"\s+", " ", text).strip()
    if len(compact) <= limit:
        return compact
    return f"{compact[: limit - 1].rstrip()}…"
