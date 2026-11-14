import json
import os
from pathlib import Path

_MARK = Path(__file__).resolve().parents[1]
_RULE_KEYS = ("limits", "master_locale", "locales", "locale_aliases", "channels")


def _load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _rules():
    full = _load(_MARK.parent / "tool" / "config" / "rules.json")
    return {key: full[key] for key in _RULE_KEYS}


def _private():
    default = _MARK / "local.config.example.json"
    return _load(os.environ.get("TLC_CONFIG") or default)


RULES = _rules()
PRIVATE = _private()
