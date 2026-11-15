"""The run folder: large data between steps of one run, as {data, checksum} files.

Reading has two layers. Layer 1 (read_run_file, never skipped): the file's own checksum
must match its data. Layer 2 (read_verified, read_review): the file is bound to a value
handed over by an earlier step, failing closed. Every result is a fresh
{"status", "data", "checksum"} dict; test `status` (stored data may itself be null).
Statuses: "ok", "not_checked" (missing, unreadable, malformed or changed: re-run) and
"invalid_path" (a run key or file name that is not well-formed: both reach a step through
the model). Nothing here raises.
"""

import json
import re
import secrets
from pathlib import Path

from _checksum import canonical_bytes, facts_checksum

RUN_ROOT = Path("/workspace/tlc")  # files here persist between the steps of one run
CHECK_FILE = "check.json"  # "Read and check the file" -> Score, bound by check_checksum
SCORES_FILE = "scores.json"  # Score -> the report, bound by verdict_checksum
RUN_KEY = re.compile(r"[0-9a-f]{16}")
LOCALE = r"[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|[0-9]{3}))?"  # en-US, es-419, zh-Hant-TW
RUN_FILE = re.compile(rf"[a-z0-9_-]+(/{LOCALE})?\.json")  # rules.json, reviews/es-419.json


def run_root(ctx):
    """RUN_ROOT. A test passes its own folder as ctx["run_root"]; Mark's ctx has no such key."""
    root = ctx.get("run_root") if isinstance(ctx, dict) else None
    return Path(root) if root else RUN_ROOT


def new_run_key():
    return secrets.token_hex(8)


def _run_path(run_key, name, root):
    """None unless both parts are well-formed strings."""
    if not (isinstance(run_key, str) and isinstance(name, str)):
        return None
    ok = RUN_KEY.fullmatch(run_key) and RUN_FILE.fullmatch(name)
    return root / run_key / name if ok else None


def _write(path, blob):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(blob)
    return "ok"


def _store(path, blob):
    try:
        return _write(path, blob)
    except OSError:
        return "unavailable"


def _stored_blob(data):
    """The file's bytes, or None. Built before anything is touched: the wrapper is one level
    deeper than the data, so data at the depth limit can serialize while the file can't."""
    checksum = facts_checksum(data)
    return canonical_bytes({"data": data, "checksum": checksum}) if checksum else None


def write_run_file(run_key, name, data, *, root=RUN_ROOT):
    """Returns "ok"; "invalid_path" or "invalid_data" (data that would not read back
    unchanged), touching nothing; or "unavailable" (storage failed)."""
    path, blob = _run_path(run_key, name, root), _stored_blob(data)
    if path is None or blob is None:
        return "invalid_path" if path is None else "invalid_data"
    return _store(path, blob)


def not_checked(status="not_checked"):
    """A fresh result each time (never a shared dict a caller could change)."""
    return {"status": status, "data": None, "checksum": None}


def _load_stored(path):
    try:
        return json.loads(path.read_bytes())
    except (OSError, ValueError, RecursionError):
        return None


def _intact(stored):
    if not isinstance(stored, dict) or not isinstance(stored.get("checksum"), str):
        return False
    return facts_checksum(stored.get("data")) == stored["checksum"]


def _read(path):
    stored = _load_stored(path)
    if not _intact(stored):
        return not_checked()
    return {"status": "ok", "data": stored["data"], "checksum": stored["checksum"]}


def read_run_file(run_key, name, *, root=RUN_ROOT):
    """Layer 1: the file's own checksum must match its data."""
    path = _run_path(run_key, name, root)
    return _read(path) if path is not None else not_checked("invalid_path")


def _bound(result, found, expected):
    """Layer 2, fail closed: the handed-over value must be a non-empty string and match.
    A failed layer 1 (not_checked or invalid_path) is passed through unchanged."""
    if result["status"] != "ok":
        return result
    ok = isinstance(expected, str) and expected != "" and found == expected
    return result if ok else not_checked()


def read_verified(run_key, name, checksum, *, root=RUN_ROOT):
    """A file only if its stored checksum is the one an earlier step handed over."""
    result = read_run_file(run_key, name, root=root)
    return _bound(result, result["checksum"], checksum)


def _echo(data, locale):
    """The review's checksum echo, only from an object that names its own locale."""
    ok = isinstance(data, dict) and data.get("locale") == locale
    return data.get("checksum") if ok else None


def read_review(run_key, locale, checksum, *, root=RUN_ROOT):
    """A saved review counts only if it names its locale and echoes the locale's checksum
    from the verified report. RUN_FILE refuses a name built from a malformed locale."""
    result = read_run_file(run_key, f"reviews/{locale}.json", root=root)
    return _bound(result, _echo(result["data"], locale), checksum)
