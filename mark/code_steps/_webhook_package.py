"""A webhook payload -> the package. The payload reaches the step through the orchestrator
model, so it counts only if its package_sha256 (the full SHA-256 of the canonical JSON of
every other field) verifies; then its shape is checked strictly (no unknown keys, strings
where strings belong), then the shared package rules. Nothing here raises."""

from _campaign import clean_campaign
from _checksum import sha256_hex
from _model_output import json_object
from _package import validate_package
from _text_problems import file_problem

PACKAGE_KEYS = frozenset({"campaign", "master_locale", "locales", "lines"})
LINE_KEYS = frozenset({"id", "channel", "field", "texts"})
CHECKSUM_KEY = "package_sha256"


def _strings(values):
    return isinstance(values, list) and all(isinstance(value, str) for value in values)


def _texts_ok(texts, allowed):
    """Locale -> text, keyed only by the master and listed locales (a missing text is a
    package rule, reported per cell)."""
    if not (isinstance(texts, dict) and set(texts) <= allowed):
        return False
    return _strings(list(texts.values()))


def _line_ok(line, allowed):
    if not (isinstance(line, dict) and set(line) == LINE_KEYS):
        return False
    names = _strings([line["id"], line["channel"], line["field"]])
    return names and _texts_ok(line["texts"], allowed)


def _top_ok(pkg):
    if set(pkg) != PACKAGE_KEYS:
        return False
    strings = _strings([pkg["campaign"], pkg["master_locale"]])
    return strings and _strings(pkg["locales"]) and isinstance(pkg["lines"], list)


def _shape_ok(pkg):
    allowed = {pkg.get("master_locale"), *(pkg.get("locales") or [])} if _top_ok(pkg) else None
    return allowed is not None and all(_line_ok(line, allowed) for line in pkg["lines"])


def _verified(payload):
    """The payload without its checksum, or None unless the checksum verifies."""
    rest = {key: value for key, value in payload.items() if key != CHECKSUM_KEY}
    digest = sha256_hex(rest)
    return rest if digest is not None and payload.get(CHECKSUM_KEY) == digest else None


def _trimmed_line(line):
    texts = {code.strip(): text for code, text in line["texts"].items()}
    return {**line, "texts": texts}


def _trimmed(pkg):
    """Locale codes trimmed everywhere they appear (as the CSV header is), the campaign name
    cleaned; then the shared rules see what the tool will see."""
    master, locales = pkg["master_locale"].strip(), [code.strip() for code in pkg["locales"]]
    lines = [_trimmed_line(line) for line in pkg["lines"]]
    named = {"campaign": clean_campaign(pkg["campaign"]), "master_locale": master}
    return {**pkg, **named, "locales": locales, "lines": lines}


def _checked_package(pkg, rules):
    clean = _trimmed(pkg)
    problems = validate_package(clean, rules)
    return (None, problems) if problems else (clean, [])


def from_webhook(payload, rules):
    """(package, []) for a verified, valid package, else (None, every problem found)."""
    given = json_object(payload)  # an object, or JSON text of one
    pkg = _verified(given) if given is not None else None
    if pkg is None or not _shape_ok(pkg):
        return None, [file_problem("changed_in_transit" if pkg is None else "bad_package")]
    return _checked_package(pkg, rules)
