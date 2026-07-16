import os
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[2]
ENV_PATH = BASE_DIR / ".env"


def _load_env_file() -> None:
    if not ENV_PATH.exists():
        return
    for raw_line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_env_file()


def _resolve_path(value: str, default: Path) -> Path:
    return Path(value).expanduser().resolve() if value else default.resolve()


DATA_DIR = _resolve_path(os.getenv("DATA_DIR", ""), BASE_DIR.parent / "data_samples")
DB_PATH = _resolve_path(os.getenv("DB_PATH", ""), BASE_DIR / "power_market.db")

POLICY_LLM_API_KEY = os.getenv("POLICY_LLM_API_KEY", "").strip()
POLICY_LLM_BASE_URL = os.getenv("POLICY_LLM_BASE_URL", "https://api.openai.com/v1").rstrip("/")
POLICY_LLM_MODEL = os.getenv("POLICY_LLM_MODEL", "").strip()
POLICY_LLM_TIMEOUT = int(os.getenv("POLICY_LLM_TIMEOUT", "90"))

DEFAULT_ADMIN_USERNAME = os.getenv("DEFAULT_ADMIN_USERNAME", "admin").strip()
DEFAULT_ADMIN_PASSWORD = os.getenv("DEFAULT_ADMIN_PASSWORD", "admin123").strip()
SESSION_EXPIRE_DAYS = int(os.getenv("SESSION_EXPIRE_DAYS", "7"))
