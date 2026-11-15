"""RULES and PRIVATE: read from files in dev and tests, literals after the build.

PRIVATE holds only the keys a code step may see, in a checked shape: allow_list, qa_inbox,
template_url, and webhook_trigger_name (the webhook trigger's run name; None if absent).
Script-only values (the webhook section) and credentials never reach a step. The private
file is the one named by TLC_CONFIG, else mark/local.config.json, else the example file. A
missing required key or a wrong shape raises at import.
"""

import json
import os
from pathlib import Path

from _address import on_allow_list, valid_allow_list
from _url import valid_template_url

_MARK = Path(__file__).resolve().parents[1]
_RULE_KEYS = ("limits", "master_locale", "locales", "locale_aliases", "channels", "severities")
_PRIVATE_KEYS = ("allow_list", "qa_inbox", "template_url")
_OPTIONAL_KEYS = ("webhook_trigger_name",)  # missing: None, and no run counts as a webhook
MAX_TRIGGER_NAME = 100


def _load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _rules():
    full = _load(_MARK.parent / "tool" / "config" / "rules.json")
    return {key: full[key] for key in _RULE_KEYS}


def _private_path(mark_dir):
    local = mark_dir / "local.config.json"
    fallback = local if local.is_file() else mark_dir / "local.config.example.json"
    return os.environ.get("TLC_CONFIG") or fallback


def _problem(private):
    """What is wrong with the private values, or None. Names no value (it may be printed)."""
    allow = private["allow_list"]
    if not valid_allow_list(allow):
        return "allow_list needs lists of valid addresses and bare domains"
    inbox = _inbox_problem(private["qa_inbox"], allow) or _url_problem(private["template_url"])
    return inbox or _trigger_problem(private["webhook_trigger_name"])


def _trigger_problem(name):
    """The webhook trigger's run name: one printable line, or absent."""
    ok = name is None or (isinstance(name, str) and 0 < len(name) <= MAX_TRIGGER_NAME)
    ok = ok and (name is None or name.isprintable())
    return None if ok else "webhook_trigger_name must be one line of text"


def _inbox_problem(qa_inbox, allow):
    ok = on_allow_list(qa_inbox, allow)
    return None if ok else "qa_inbox must be a valid address on the allow_list"


def _url_problem(url):
    return None if valid_template_url(url) else "template_url must be an https URL"


def _checked(private):
    problem = _problem(private)
    if problem:
        raise ValueError("local config: " + problem)
    return private


def _private(mark_dir=_MARK):
    full = _load(_private_path(mark_dir))
    optional = {key: full.get(key) for key in _OPTIONAL_KEYS}
    return _checked({**{key: full[key] for key in _PRIVATE_KEYS}, **optional})


RULES = _rules()
PRIVATE = _private()
