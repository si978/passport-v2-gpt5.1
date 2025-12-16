from __future__ import annotations

import json
import os
from typing import Any, Dict

try:  # pragma: no cover
    from shell.session_file_manager import default_session_path
except Exception:  # pragma: no cover
    from .session_file_manager import default_session_path


CONFIG_FILENAME = "passport-client.json"


def default_config_path() -> str:
    base_dir = os.path.dirname(default_session_path())
    return os.path.join(base_dir, CONFIG_FILENAME)


def load_config(path: str) -> Dict[str, Any]:
    p = (path or "").strip() or default_config_path()
    try:
        with open(p, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except FileNotFoundError:
        return {}
    except Exception:  # noqa: BLE001
        return {}


def save_config(path: str, payload: Dict[str, Any]) -> None:
    p = (path or "").strip() or default_config_path()
    os.makedirs(os.path.dirname(p), exist_ok=True)

    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    os.replace(tmp, p)


__all__ = ["default_config_path", "load_config", "save_config"]

