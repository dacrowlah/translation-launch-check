"""Canonical JSON and the two checksum recipes. Nothing here raises.

Canonical JSON is exactly what json.dumps(sort_keys=True, separators=(",", ":"),
ensure_ascii=False, allow_nan=False) writes, encoded as UTF-8. Data that is not plain JSON
(a lone surrogate, NaN or infinity, a non-string key, a tuple or set, nesting too deep to
serialize) has no canonical form: every helper returns None for it, so it can never verify.
"""

import hashlib
import json


def _dumps(value):
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False
    )


def _blob(value):
    try:
        return _dumps(value).encode("utf-8")
    except Exception:  # TypeError, ValueError (UnicodeEncodeError), RecursionError, a raising
        return None  # __lt__ on a key subclass: never raise


def _round_trips(blob, value):
    """False for data JSON would change: non-string keys, tuples. The except covers a value
    whose __eq__ raises (json.loads itself succeeds on anything json.dumps wrote)."""
    try:
        return json.loads(blob) == value
    except Exception:
        return False


def canonical_bytes(value):
    """The canonical JSON as UTF-8 bytes, or None for data that is not plain JSON."""
    blob = _blob(value)
    return blob if blob is not None and _round_trips(blob, value) else None


def canonical_json(value):
    blob = canonical_bytes(value)
    return blob.decode("utf-8") if blob is not None else None


def sha256_hex(value):
    """The webhook package recipe: the full 64-hex SHA-256 of the canonical JSON, or None."""
    blob = canonical_bytes(value)
    return hashlib.sha256(blob).hexdigest() if blob is not None else None


def facts_checksum(value):
    """The internal handoff recipe: the first 16 hex of sha256_hex, or None."""
    digest = sha256_hex(value)
    return digest[:16] if digest is not None else None


def locale_checksum(locale, lines, rule_findings):
    """Covers the locale code too, so identical text in two locales gives different values."""
    return facts_checksum({"locale": locale, "lines": lines, "rule_findings": rule_findings})


def json_size(value):
    """The size of the largest form of a single unindented encoding (stdlib json, ASCII
    escapes, default ", " and ": " separators): never smaller than the UTF-8 canonical form.
    None for data that is not plain JSON. The one measure for return and loop-item caps.
    Indentation, a second encoding or a platform envelope would be larger: how Mark measures
    a return is unverified; it is checked by a throwaway before the report step relies on it."""
    if canonical_bytes(value) is None:
        return None
    return len(json.dumps(value, sort_keys=True, ensure_ascii=True, allow_nan=False))
