"""Example Mark workflow code step: check a localization package with a custom tool.

What it shows (see SKILL.md):
- `handler` is `run_safely(impl, input, ctx, fallback)`: nothing raises out of the step;
- `call_tool` (our own tool) returns `{"ok", "status", "body"}`: the tool's status token, or
  "unavailable" for an error envelope, a non-dict result, a raise, or a body status_code >= 400;
- platform tools get small helpers that check their own fields (`send_email` must say "sent");
- the orchestrator model fills every input, so narrow trigger inputs are checked: a webhook
  package counts only if its `package_sha256` (full 64-hex SHA-256 of the canonical JSON
  of every other field) verifies; email inputs are used only when `trigger_name` is
  "Email" (`from_trigger`) and the attachment has the recorded shape;
- the package has a strict schema, validated before any tool call or agent, with unknown
  keys rejected at every level: exactly `campaign` (non-empty, <= 100 characters),
  `master_locale`, `locales` and `lines` (plus `package_sha256` on the webhook); each line
  exactly `id` (letter first), `channel`, `field` (non-empty, <= 40 characters) and
  `texts`, whose keys are only the master and listed locale codes (letter first by the
  locale pattern), so no key anywhere is integer-like. Checks, in order: the data itself
  (first text that can't be encoded as UTF-8, i.e. lone surrogates: "save the file as
  UTF-8"; then NaN, Infinity, tuples or non-string keys: "isn't valid JSON"), then
  `locales` and `lines` must be non-empty lists (else "nothing to check"), the reserved
  route-token prefix anywhere, the top-level keys and campaign, the counts (locales
  against the loop's `max_iterations`, lines <= 50, before any per-line work), locale
  codes, the master (a locale code, not also listed), duplicate locales, each line's
  keys, duplicate line ids (linear), each text cell (visible text for the master and every
  listed locale), then per-item and
  total size caps on the loop items (one per locale: each line's id, master and text).
  Simplified: the first problem is reported, and the single `bad_line` message stands in
  for one message per reason (extra key, missing key, bad id, over-long channel, unlisted
  locale...); a real step collects every problem and reports each with its own message.
  Control characters (category Cc other than tab, LF and CR) are rejected in every string
  field: campaign, locale codes, line ids, channel, field and text cells; the single-line
  fields (campaign, channel, field, and ids and locale codes by their patterns) refuse
  line breaks too (LF, CR, U+2028, U+2029);
- `strip_translation_leak` removes only Content Translation's observed leak at the end of
  the text, in linear time (no regex over model output); `leak_free_text` turns a result
  with nothing usable left into None (-> check_incomplete);
- `canonical_json` / `facts_checksum` never raise (None for anything that isn't finite,
  string-keyed, encodable JSON); large data goes to the run folder as `{data, checksum}`.
  `read_run_file` always checks a file's own checksum; callers then bind it to a
  handed-over value (`read_report`, `read_review`), failing closed; `invalid_path` is passed
  through, distinct from `not_checked`;
- `locale_checksum` covers the locale code plus its lines and rule findings, so two locales
  with identical text still differ;
- this simplified step returns only a route token, the run key and a checksum. A real
  first step also returns the loop items (each with its checksum): that is the output the
  item-count, per-item and total caps protect (256 KB return limit, agent input size).
- user-facing text comes only from `TEXT`, keyed by status; nothing is printed;
- every function body is at most 5 counted lines.

The SHARED helpers belong in one module that a build step inlines into every code step
(a code step is one file; local imports fail). Tests put a fake `opal_tms_sdk` on sys.path.
`example_check`, the `example_route_` prefix and `/workspace/example` are placeholders.

This is the webhook variant: the package comes in a webhook payload, which is itself a
code-step input and so must fit the 75,776-byte cap. Senders measure the UTF-8 bytes of the
JSON body as sent and refuse anything above 50,000 bytes (margin: the cap was related to
payload size by one ASCII measurement with about 1.32x platform wrapping; non-ASCII
expansion is untested). Over the cap the platform fails the run before this code starts.
So the 60 KB / 200 KB caps below can only fire in the chat and email variants, which read
the file from disk or a tool. The "unreadable" check matters there too; here the checksum
fails first on unencodable text, so it is a guard for the shared helpers. The chat variant
reads the attachment from `ctx["input_dir"]`; a run of this webhook variant that isn't a
webhook run gets "no file arrived", never "re-send".
"""

import hashlib
import json
import pathlib
import re
import secrets
import unicodedata

from opal_tms_sdk import tools

# --- SHARED: canonical JSON and checksums ----------------------------------------------


def _dumps(value):
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False
    )


def canonical_bytes(value):
    """The canonical JSON as UTF-8 bytes, or None. Never raises."""
    try:
        return _dumps(value).encode("utf-8")
    except (TypeError, ValueError, RecursionError):  # UnicodeEncodeError is a ValueError
        return None


def canonical_json(value):
    """Sorted keys, compact separators, raw characters, finite numbers; None if impossible."""
    blob = canonical_bytes(value)
    return blob.decode("utf-8") if blob is not None else None


def _digest(value):
    blob = canonical_bytes(value)
    return hashlib.sha256(blob).hexdigest() if blob is not None else None


def facts_checksum(value):
    """16-hex fingerprint for data handed to a later step, or None. Never raises."""
    digest = _digest(value)
    return digest[:16] if digest else None


# --- SHARED: tool calls ----------------------------------------------------------------

TOOL_STATUSES = ("ok", "invalid_input", "internal_error", "invalid_request")
MAX_ATTACHMENT_BYTES = 256_000
GS_URL = re.compile(r"gs://[a-z0-9._-]+/[^\s?#]+")  # the recorded shape only
LEAK = "[[file]] (at least one needed)"  # Content Translation's observed English leak
RECORDED_NON_WEBHOOK = ("Chat", "Scheduler", "Email")  # recorded trigger_name values


def _invoke(tool, params):
    try:
        return getattr(tools, tool)(**params)
    except Exception:  # the SDK defines ToolInvocationError, ToolUnavailableError, ...
        return None


def _body(result):
    """The response body, or None for every failure shape seen: error envelope, non-dict, 5xx."""
    if not isinstance(result, dict) or result.get("response_type") == "error":
        return None
    body = result.get("response")
    code = body.get("status_code") if isinstance(body, dict) else None
    return None if isinstance(code, int) and code >= 400 else body


def _status(body):
    status = body.get("status") if isinstance(body, dict) else None
    return status if status in TOOL_STATUSES else "unavailable"


def call_tool(tool, /, **params):
    """Our own tool, which always answers with a top-level status token."""
    body = _body(_invoke(tool, params))
    status = _status(body)
    return {"ok": status == "ok", "status": status, "body": body if status == "ok" else None}


def call_platform(tool, /, **params):
    """A platform tool (no status token of ours): the body dict or None; callers check fields."""
    body = _body(_invoke(tool, params))
    return body if isinstance(body, dict) else None


def send_email(recipient, subject, text):
    """True only for "sent": in chat, send_email returns "pending" and sends nothing."""
    body = call_platform("send_email", recipient_emails=recipient, subject=subject, body=text)
    return body is not None and body.get("status") == "sent"


def create_canvas(name, content):
    body = call_platform("create_canvas", name=name, content=content, mime_type="text/markdown")
    url = body.get("artifact_url") if body else None
    return url if isinstance(url, str) else None


def _csv_attachment(attachment):
    """Shape-only check before the call (bucket names are platform-internal): every
    create_csv_canvas call leaves a canvas you can't delete."""
    if not isinstance(attachment, dict) or not GS_URL.fullmatch(str(attachment.get("url"))):
        return False
    size, name = attachment.get("size_bytes"), str(attachment.get("filename", "")).lower()
    return name.endswith(".csv") and type(size) is int and 0 < size <= MAX_ATTACHMENT_BYTES


def _csv_text(body, size):
    data = body.get("data") if body else None
    text = data.get("content") if isinstance(data, dict) else None
    return text if isinstance(text, str) and len(text.encode("utf-8")) == size else None


def read_csv_attachment(attachment, title):
    """An emailed CSV's text, or None. Call it once per run, for exactly one attachment."""
    if not _csv_attachment(attachment):
        return None
    body = call_platform("create_csv_canvas", title=title, csv_urls=[attachment.get("url")])
    return _csv_text(body, attachment["size_bytes"])


def from_trigger(input, trigger_name, key):
    """An input used only on its own trigger. Use only recorded names ("Chat", "Scheduler",
    "Email"); the webhook value is unrecorded. Hygiene, not a boundary: the model fills both."""
    return input.get(key) if input.get("trigger_name") == trigger_name else None


def _package(payload):
    rest = {key: value for key, value in payload.items() if key != "package_sha256"}
    digest = _digest(rest)
    return rest if digest is not None and payload.get("package_sha256") == digest else None


def verified_webhook_package(input):
    """The webhook package without its checksum, or None unless `package_sha256` verifies."""
    payload = input.get("webhook_payload")
    return _package(payload) if isinstance(payload, dict) else None


def _drop_leak_or(head):
    """The leak's own "or": the last word, after any whitespace (NBSP, newline) or alone."""
    if head == "or" or (head.endswith("or") and head[-3:-2].isspace()):
        return head[:-2].rstrip()
    return head


def strip_translation_leak(text):
    """Removes "[[file]] (at least one needed)" at the very end (trailing whitespace
    ignored) and the one "or" before it; nothing else, in linear time. A real "or" before
    that one survives ("Buy or or <leak>" -> "Buy or"); a real "or" that is the last word
    before the marker can't be told from the leak's and is removed too."""
    body = text.rstrip() if isinstance(text, str) else ""
    return _drop_leak_or(body[: -len(LEAK)].rstrip()) if body.endswith(LEAK) else text


def leak_free_text(text):
    """The agent's text without the leak, or None (None, empty or whitespace-only result):
    the caller then marks that locale check_incomplete."""
    result = strip_translation_leak(text)
    return result if isinstance(result, str) and result.strip() else None


def run_safely(impl, input, ctx, fallback):
    """The one broad guard. Never print: Mark's chat narrates stdout and stderr."""
    try:
        return impl(input, ctx)
    except Exception:
        return fallback


# --- SHARED: run folder ----------------------------------------------------------------

RUN_ROOT = pathlib.Path("/workspace/example")  # files here persist between steps of a run
RUN_KEY = re.compile(r"[0-9a-f]{16}")
LOCALE = r"[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|[0-9]{3}))?"  # en-US, es-419, zh-Hant-TW
LOCALE_CODE = re.compile(LOCALE)
RUN_FILE = re.compile(rf"[a-z0-9_-]+(/{LOCALE})?\.json")  # report.json, reviews/es-419.json


def _run_path(run_key, name):
    """None unless both parts are well-formed: both can reach a step through the model."""
    if not (isinstance(run_key, str) and isinstance(name, str)):
        return None
    ok = RUN_KEY.fullmatch(run_key) and RUN_FILE.fullmatch(name)
    return RUN_ROOT / run_key / name if ok else None


def _write(path, blob):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(blob)
    return "ok"


def _store(path, blob):
    try:
        return _write(path, blob)
    except OSError:
        return "unavailable"


def _round_trips(blob, data):
    try:
        return json.loads(blob) == data
    except (ValueError, RecursionError):
        return False


def _json_native(data):
    """True only if the data survives a JSON round trip unchanged (string keys, no tuples)."""
    blob = canonical_bytes(data)
    return blob is not None and _round_trips(blob, data)


def write_run_file(run_key, name, data):
    """Returns "ok", "invalid_path" or "invalid_data" (nothing touched), or "unavailable"."""
    path = _run_path(run_key, name)
    checksum = facts_checksum(data) if _json_native(data) else None
    if path is None or checksum is None:
        return "invalid_path" if path is None else "invalid_data"
    return _store(path, canonical_bytes({"data": data, "checksum": checksum}))


def not_checked(status="not_checked"):
    """A fresh result each time (never a shared dict a caller could change)."""
    return {"status": status, "data": None, "checksum": None}


def _load(path):
    try:
        return json.loads(path.read_bytes())
    except (OSError, ValueError, RecursionError):
        return None


def _intact(stored):
    if not isinstance(stored, dict) or not isinstance(stored.get("checksum"), str):
        return False
    return facts_checksum(stored.get("data")) == stored["checksum"]


def _read(path):
    stored = _load(path)
    if not _intact(stored):
        return not_checked()  # missing, unreadable, malformed or changed
    return {"status": "ok", "data": stored["data"], "checksum": stored["checksum"]}


def read_run_file(run_key, name):
    """Layer 1, never skipped: the file's own checksum must match its content.

    Returns {"status", "data", "checksum"}; status "ok", "not_checked" or "invalid_path".
    Test `status` (stored data may itself be null). Callers then bind the file to a
    handed-over value (layer 2): `read_report`, `read_review`.
    """
    path = _run_path(run_key, name)
    return _read(path) if path else not_checked("invalid_path")


def _bound(result, found, expected):
    """Layer 2, fail closed: the handed-over value must be a non-empty string and match.
    A failed layer 1 (not_checked or invalid_path) is passed through unchanged."""
    if result["status"] != "ok":
        return result
    ok = isinstance(expected, str) and expected and found == expected
    return result if ok else not_checked()


def read_report(run_key, report_checksum):
    """The first step's report, only if it is the one whose checksum was handed over."""
    result = read_run_file(run_key, "report.json")
    return _bound(result, result["checksum"], report_checksum)


def read_review(run_key, locale, locale_checksum):
    """A saved review counts only if its data is an object whose `checksum` echo equals the
    locale's checksum from the verified report."""
    result = read_run_file(run_key, f"reviews/{locale}.json")
    data = result["data"] if isinstance(result["data"], dict) else {}
    return _bound(result, data.get("checksum"), locale_checksum)


def locale_checksum(locale, lines, rule_findings):
    """Covers the locale code too, so identical text in two locales gives different values."""
    return facts_checksum({"locale": locale, "lines": lines, "rule_findings": rule_findings})


# --- STEP: "Read and check the package" ------------------------------------------------

ROUTE_PREFIX = "example_route_"  # reserved: rejected in user copy (any case)
ROUTE_CHECK = ROUTE_PREFIX + "check"  # conditions match the whole token: \bexample_route_check\b
ROUTE_NEEDS_INFO = ROUTE_PREFIX + "needs_info"
MAX_ITEM_BYTES = 60_000  # one locale's item goes to one agent step; agents verified to ~72 KB
MAX_TOTAL_BYTES = 200_000  # all items, in UTF-8 bytes: conservative under the 256 KB return
MAX_ITEMS = 5  # the loop's max_iterations: one constant shared with the workflow definition
MAX_LINES = 50  # capped before any per-line check
MAX_CAMPAIGN = 100
MAX_NAME = 40  # channel and field
LINE_ID = re.compile(r"[A-Za-z][A-Za-z0-9_-]{0,39}")  # starts with a letter: never integer-like
PACKAGE_KEYS = frozenset({"campaign", "master_locale", "locales", "lines"})  # nothing else
LINE_KEYS = frozenset({"id", "channel", "field", "texts"})  # nothing else
VISIBLE_CATEGORIES = ("L", "N", "P", "S")  # letters, numbers, punctuation, symbols
# Examples of blank-looking characters in visible categories; not exhaustive.
BLANK_LOOKING = frozenset(
    "\u3164\u115f\u1160\uffa0\u2800\ufffc\u303f\u2422\u1361\ua8f9"
    "\U00013441\U00013442\U0001144e\U00011c44"
)
ALLOWED_CONTROLS = frozenset("\t\n\r")  # tab and LF / CR line breaks only
LINE_BREAKS = frozenset("\n\r\u2028\u2029")  # refused in single-line fields

CANT_RUN = "Couldn't run the checks right now. Your file wasn't the problem; please re-run."
NOT_AS_SENT = "The file couldn't be checked as sent. Please compare it with the template."
TEXT = {
    "ok": "Languages checked: {count}.",
    "no_package": "No file arrived. In chat, attach the file; by webhook, send the package.",
    "not_verified": "The package didn't arrive intact (its checksum doesn't match). Re-send it.",
    "no_items": "There was nothing to check. Please send at least one language and one line.",
    "reserved_word": "The file contains a reserved word (" + ROUTE_PREFIX + "). Remove it.",
    "unknown_field": "The package must have exactly campaign, master_locale, locales and lines.",
    "bad_campaign": "The campaign name must be one line of 1-100 visible characters.",
    "too_many_lines": "Too many lines in one file (at most {limit}). Please split the file.",
    "too_many": "Too many languages in one file (at most {limit}). Please split the file.",
    "bad_locale": "Language {index} isn't a locale code like de-DE.",
    "bad_master": "The master locale must be a locale code like en-US.",
    "master_listed": "The master locale is also listed as a language. List only translations.",
    "duplicate": "Language {index} repeats an earlier locale. Each locale may appear only once.",
    "bad_line": "Line {index} must have exactly an id starting with a letter (like L1), a "
    "channel, a field and texts for listed locales only.",
    "duplicate_id": "Line {index} repeats an earlier line id. Each id may appear only once.",
    "missing_text": "Line {line} has no {locale} text. Fill in every cell.",
    "invalid_text": "Line {line} has a control character in its {locale} text. Remove it.",
    "unreadable": "The file contains characters that can't be read. Please save it as UTF-8.",
    "invalid_data": "The data isn't valid JSON; re-export the file.",
    "too_large": "Language {index} is too large to check in one piece. Please split the file.",
    "too_large_total": "The file is too large to check in one run. Please split the file.",
    "invalid_input": NOT_AS_SENT,
    "invalid_request": NOT_AS_SENT,
    "internal_error": CANT_RUN,
    "unavailable": CANT_RUN,
    "step_error": "Something went wrong on our side. Please re-run the check.",
}


def outcome(route, message, **extra):
    return {"route": route, "message": message, **extra, "summary": route}


def needs_info(key, **values):
    return outcome(ROUTE_NEEDS_INFO, TEXT[key].format(**values))


FALLBACK = needs_info("step_error")


def saved(items, body):
    run_key = secrets.token_hex(8)
    if write_run_file(run_key, "report.json", body) != "ok":
        return needs_info("step_error")
    message = TEXT["ok"].format(count=len(items))
    return outcome(ROUTE_CHECK, message, run_key=run_key, report_checksum=facts_checksum(body))


def checked(items):
    result = call_tool("example_check", items=items)
    if not result["ok"]:
        return needs_info(result["status"])
    return saved(items, result["body"])


def _first(flags):
    return next((index + 1 for index, flag in enumerate(flags) if flag), None)


def _visible(char):
    return unicodedata.category(char)[0] in VISIBLE_CATEGORIES and char not in BLANK_LOOKING


def _has_text(value):
    """At least one letter, number, punctuation or symbol (Unicode L*, N*, P*, S*) that isn't
    a known blank-looking character. Limit: the blank list can't be complete; a font may
    still draw other characters as nothing."""
    return isinstance(value, str) and any(_visible(char) for char in value)


def _is_control(char):
    """Unicode Cc other than tab, LF and CR. U+2028/U+2029 aren't Cc: they count as
    whitespace (allowed, not visible text)."""
    return unicodedata.category(char) == "Cc" and char not in ALLOWED_CONTROLS


def _plain(value):
    """A string without control characters: the one helper for every string field."""
    return isinstance(value, str) and not any(_is_control(char) for char in value)


def _one_line(value):
    """Single-line fields (campaign, channel, field) also refuse line breaks (LF, CR,
    U+2028, U+2029): they may be echoed into an email subject or a canvas name."""
    return _plain(value) and not any(char in LINE_BREAKS for char in value)


def _has_lists(package):
    if not isinstance(package, dict):
        return False
    locales, lines = package.get("locales"), package.get("lines")
    return isinstance(locales, list) and bool(locales) and isinstance(lines, list) and bool(lines)


def _loose_text(value):
    """Lenient JSON text (NaN, tuples and odd keys allowed), only to look for lone
    surrogates before judging whether the data is plain JSON. Never raises: anything that
    goes wrong (even an object whose __str__ raises) gives None, i.e. "isn't valid JSON"."""
    try:
        return json.dumps(value, ensure_ascii=False, skipkeys=True, default=str)
    except Exception:
        return None


def _encodable(text):
    try:
        text.encode("utf-8")
    except UnicodeEncodeError:
        return False
    return True


def _data_problem(package):
    """First: lone surrogates -> "save it as UTF-8"; NaN, Infinity, non-string keys or other
    non-JSON values -> "isn't valid JSON". Never read as empty or size 0."""
    text = _loose_text(package)
    if text is not None and not _encodable(text):
        return needs_info("unreadable")
    return None if _json_native(package) else needs_info("invalid_data")


def _reserved(package):
    """The whole package, any case, so no copy (and no line id) can carry a route token."""
    text = canonical_json(package)
    if text is None:  # unreachable after _shape_first; guards direct reuse of this helper
        return needs_info("unreadable")
    return needs_info("reserved_word") if ROUTE_PREFIX in text.lower() else None


def _top_problem(package):
    """Exactly the four fields (unknown keys rejected), and a short non-empty campaign."""
    if set(package) != PACKAGE_KEYS:
        return needs_info("unknown_field")
    campaign = package["campaign"]
    ok = _one_line(campaign) and _has_text(campaign) and len(campaign) <= MAX_CAMPAIGN
    return None if ok else needs_info("bad_campaign")


def _count(package):
    """Before any per-locale or per-line check. Beyond max_iterations is unverified."""
    if len(package["locales"]) > MAX_ITEMS:
        return needs_info("too_many", limit=MAX_ITEMS)
    too_many = len(package["lines"]) > MAX_LINES
    return needs_info("too_many_lines", limit=MAX_LINES) if too_many else None


def _repeated(values):
    """1-based index of the first value seen before, in linear time (hashable values)."""
    seen = set()
    return _first(value in seen or seen.add(value) for value in values)


def _code_ok(value):
    return _plain(value) and bool(LOCALE_CODE.fullmatch(value))


def _bad_locale(locales):
    hit = _first(not _code_ok(each) for each in locales)
    return needs_info("bad_locale", index=hit) if hit else None


def _master_problem(package):
    master = package.get("master_locale")
    if not _code_ok(master):
        return needs_info("bad_master")
    return needs_info("master_listed") if master in package["locales"] else None


def _duplicate(locales):
    """Two items with one locale would write the same run file; the last would silently win."""
    hit = _repeated(locales)
    return needs_info("duplicate", index=hit) if hit else None


def _locale_problem(package):
    locales = package["locales"]
    return _bad_locale(locales) or _master_problem(package) or _duplicate(locales)


def _short(value):
    return _one_line(value) and _has_text(value) and len(value) <= MAX_NAME


def _names_ok(line):
    letter_first = _plain(line["id"]) and LINE_ID.fullmatch(line["id"])
    return bool(letter_first) and _short(line["channel"]) and _short(line["field"])


def _line_ok(line, text_keys):
    """Exactly the line keys; texts keyed only by the master and listed locales."""
    if not (isinstance(line, dict) and set(line) == LINE_KEYS):
        return False
    texts = line["texts"]
    return _names_ok(line) and isinstance(texts, dict) and set(texts) <= text_keys


def _bad_line(package):
    keys = {package["master_locale"], *package["locales"]}
    hit = _first(not _line_ok(line, keys) for line in package["lines"])
    return needs_info("bad_line", index=hit) if hit else None


def _duplicate_id(lines):
    hit = _repeated(line["id"] for line in lines)
    return needs_info("duplicate_id", index=hit) if hit else None


def _cell_issue(value):
    """The TEXT key for one text cell's problem, or None: a control character anywhere makes
    the cell invalid; otherwise it needs visible text."""
    if isinstance(value, str) and not _plain(value):
        return "invalid_text"
    return None if _has_text(value) else "missing_text"


def _line_issue(line, locales):
    """(issue, line id, locale) for the first bad cell, or None; runs after the line checks."""
    issues = ((_cell_issue(line["texts"].get(each)), each) for each in locales)
    found = next(((issue, each) for issue, each in issues if issue), None)
    return (found[0], line["id"], found[1]) if found else None


def _text_problem(package):
    """The master and every listed locale need valid visible text on every line."""
    locales = [package["master_locale"], *package["locales"]]
    hit = next(filter(None, (_line_issue(line, locales) for line in package["lines"])), None)
    return needs_info(hit[0], line=hit[1], locale=hit[2]) if hit else None


def _package_problem(package):
    """A requester-facing rejection, or None (simplified: the first problem only). Starts
    with _shape_first, so it is safe to call on any input, JSON or not."""
    whole = _shape_first(package) or _reserved(package) or _top_problem(package)
    lines = whole or _count(package) or _locale_problem(package) or _bad_line(package)
    return lines or _duplicate_id(package["lines"]) or _text_problem(package)


def _pair(line, master, locale):
    texts = line["texts"]
    return {"id": line["id"], "master": texts[master], "text": texts[locale]}


def _item(package, locale):
    """One loop item: what that locale's agents will see (each line's master and text)."""
    master = package["master_locale"]
    return {"locale": locale, "lines": [_pair(line, master, locale) for line in package["lines"]]}


def _sizes(items):
    """UTF-8 sizes, or None if any item can't be encoded (never counted as size 0)."""
    blobs = [canonical_bytes(item) for item in items]
    return None if None in blobs else [len(blob) for blob in blobs]


def _too_large(sizes):
    too_large = _first(size > MAX_ITEM_BYTES for size in sizes)
    if too_large:
        return needs_info("too_large", index=too_large)
    return needs_info("too_large_total") if sum(sizes) > MAX_TOTAL_BYTES else None


def _size_problem(items):
    """None can't happen after _shape_first; the branch guards direct reuse."""
    sizes = _sizes(items)
    return needs_info("unreadable") if sizes is None else _too_large(sizes)


def _checked_items(items):
    return _size_problem(items) or checked(items)


def _shape_first(package):
    """The data itself first (so a tuple isn't "nothing to check"), then non-empty lists."""
    return _data_problem(package) or (None if _has_lists(package) else needs_info("no_items"))


def _checked_package(package):
    problem = _package_problem(package)
    return problem or _checked_items([_item(package, each) for each in package["locales"]])


def _no_package(input):
    """A recorded non-webhook run (e.g. chat), or an empty / non-object payload."""
    payload = input.get("webhook_payload")
    empty = not isinstance(payload, dict) or not payload
    return empty or input.get("trigger_name") in RECORDED_NON_WEBHOOK


def check_package(input, ctx):
    package = verified_webhook_package(input)
    if package is None:
        return needs_info("no_package" if _no_package(input) else "not_verified")
    return _checked_package(package)


def handler(input: dict, ctx: dict) -> dict:
    return run_safely(check_package, input, ctx, FALLBACK)
