from collections import defaultdict, deque
from datetime import datetime, timedelta


CHAT_WINDOW_SECONDS = 60
CHAT_LIMIT_PER_WINDOW = 3

TOPIC_KEYWORDS = {
    "电力",
    "电价",
    "现货",
    "中长期",
    "能源",
    "新能源",
    "风电",
    "光伏",
    "火电",
    "水电",
    "储能",
    "申报",
    "出清",
    "结算",
    "偏差",
    "售电",
    "用户侧",
    "交易中心",
    "调度",
    "机组",
    "负荷",
    "市场主体",
    "绿电",
    "辅助服务",
    "容量",
}

FOLLOW_UP_KEYWORDS = {
    "这个",
    "这条",
    "这份",
    "该政策",
    "该文件",
    "这里",
    "它",
    "那对",
    "那么",
    "进一步",
    "具体",
    "继续",
    "如果",
}

CHAT_REQUEST_LOG: dict[str, deque[datetime]] = defaultdict(deque)


def check_chat_rate_limit(client_key: str) -> tuple[bool, int]:
    now = datetime.now()
    window_start = now - timedelta(seconds=CHAT_WINDOW_SECONDS)
    queue = CHAT_REQUEST_LOG[client_key]
    while queue and queue[0] < window_start:
        queue.popleft()
    if len(queue) >= CHAT_LIMIT_PER_WINDOW:
        return False, 0
    queue.append(now)
    return True, max(CHAT_LIMIT_PER_WINDOW - len(queue), 0)


def is_policy_chat_question_allowed(question: str, history_text: str = "") -> bool:
    text = f"{question} {history_text}".lower()
    if any(keyword.lower() in text for keyword in TOPIC_KEYWORDS):
        return True
    return any(keyword in question for keyword in FOLLOW_UP_KEYWORDS) and any(
        keyword.lower() in history_text.lower() for keyword in TOPIC_KEYWORDS
    )
