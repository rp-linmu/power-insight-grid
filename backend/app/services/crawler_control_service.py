import json
import os
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


CRAWLER_CONTROL_URL = os.getenv("CRAWLER_CONTROL_URL", "http://127.0.0.1:8787").rstrip("/")
CRAWLER_REQUEST_TIMEOUT = float(os.getenv("CRAWLER_REQUEST_TIMEOUT", "60"))


class CrawlerControlError(RuntimeError):
    pass


def crawler_get(path: str, query: dict[str, str] | None = None) -> dict[str, object]:
    suffix = f"?{urlencode(query)}" if query else ""
    return _request("GET", f"{path}{suffix}")


def crawler_post(path: str, payload: dict[str, object]) -> dict[str, object]:
    return _request("POST", path, payload)


def get_crawler_service_status() -> dict[str, object]:
    try:
        tasks = crawler_get("/api/tasks")
        return {
            "ok": True,
            "message": "数据获取服务已连接。",
            "control_url": CRAWLER_CONTROL_URL,
            "task_count": len(tasks.get("tasks", [])),
        }
    except CrawlerControlError as exc:
        return {
            "ok": False,
            "message": str(exc),
            "control_url": CRAWLER_CONTROL_URL,
            "task_count": 0,
        }


def _request(
    method: str,
    path: str,
    payload: dict[str, object] | None = None,
) -> dict[str, object]:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = Request(
        f"{CRAWLER_CONTROL_URL}{path}",
        data=data,
        method=method,
        headers={"Content-Type": "application/json; charset=utf-8"},
    )
    try:
        with urlopen(request, timeout=CRAWLER_REQUEST_TIMEOUT) as response:
            body = response.read().decode("utf-8")
            return json.loads(body) if body else {}
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise CrawlerControlError(f"数据获取服务返回错误 {exc.code}: {detail}") from exc
    except (URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise CrawlerControlError(
            f"无法连接数据获取服务 {CRAWLER_CONTROL_URL}，请确认系统启动脚本已运行。"
        ) from exc
