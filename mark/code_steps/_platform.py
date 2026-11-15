"""Helpers for the platform's own tools, each checking that tool's fields (inlined at build).

The status-token rule of call_tool is for our own tool only. Nothing here raises or prints.
"""

import re
import unicodedata

from _address import on_allow_list
from _config import PRIVATE, RULES
from _shared import call_platform

MAX_FILE_BYTES = RULES["limits"]["max_file_bytes"]
GS_URL = re.compile(r"gs://[a-z0-9._-]+/[^\s?#]+")  # the recorded shape only
SEPARATORS = frozenset("\u2028\u2029")  # line and paragraph separators (Zl, Zp)
UNSAFE_CATEGORIES = ("Cc", "Cf", "Cs")
BOM = "\ufeff"
REPLACEMENT = "\ufffd"
BOM_BYTES = 3  # a UTF-8 BOM, counted in size_bytes


def allowed_recipient(address):
    """The one check every email goes through: on PRIVATE's allow-list (see _address)."""
    return on_allow_list(address, PRIVATE["allow_list"])


def _breaks_line(char):
    """Cc (tab, NEL, VT, NUL...), Cf (bidi controls such as U+202E, zero-width characters,
    soft hyphen), Cs (lone surrogates) and U+2028/9: a subject must read as its characters."""
    return unicodedata.category(char) in UNSAFE_CATEGORIES or char in SEPARATORS


def _one_line(text):
    return isinstance(text, str) and not any(_breaks_line(char) for char in text)


def send_email(recipient, subject, text):
    """True only for "sent" (in chat it is "pending" and nothing is sent). Never calls for a
    recipient off the allow-list or a subject with a control, format or line-break character."""
    if not (allowed_recipient(recipient) and _one_line(subject)):
        return False
    body = call_platform("send_email", recipient_emails=recipient, subject=subject, body=text)
    return body is not None and body.get("status") == "sent"


def create_canvas(name, content):
    """The canvas's artifact_url, or None. The same name reuses a canvas: make it unique."""
    body = call_platform("create_canvas", name=name, content=content, mime_type="text/markdown")
    url = body.get("artifact_url") if body else None
    return url if isinstance(url, str) and url.strip() else None


def _download_link(link):
    """An https link that can sit inside a Markdown link: no space or parenthesis."""
    shaped = isinstance(link, str) and link.startswith("https://")
    return shaped and not any(char.isspace() or char in "()" for char in link)


def write_file(name, content):
    """The written file's download_link, or None. The result sits under file_metadata, not
    data (verified): {success, file_metadata: {..., link, download_link}, error}."""
    body = call_platform("write_content_to_file", content=content, filename=name)
    meta = body.get("file_metadata") if body else None
    link = meta.get("download_link") if isinstance(meta, dict) else None
    return link if _download_link(link) else None


def _csv_shape(name, url, size):
    csv = isinstance(name, str) and name.lower().endswith(".csv")
    linked = isinstance(url, str) and GS_URL.fullmatch(url) is not None
    return csv and linked and type(size) is int and 0 < size <= MAX_FILE_BYTES


def _csv_attachment(attachment):
    """Shape-only check before the call: every create_csv_canvas call leaves a canvas."""
    if not isinstance(attachment, dict):
        return False
    get = attachment.get
    return _csv_shape(get("filename"), get("url"), get("size_bytes"))


def _utf8_size(text):
    try:
        return len(text.encode("utf-8"))
    except UnicodeEncodeError:  # lone surrogates: the file wasn't UTF-8
        return None


def _size_matches(text, measured, size):
    """size_bytes counts the raw file. Whether the tool keeps a UTF-8 BOM is unverified, so a
    complete text (ending with a newline) without one may be exactly BOM_BYTES short."""
    dropped_bom = text.endswith("\n") and not text.startswith(BOM)
    dropped_bom = dropped_bom and measured + BOM_BYTES == size
    return measured == size or dropped_bom


def _measured_status(text, size):
    measured = _utf8_size(text)
    if measured is None:
        return "unreadable"
    return "ok" if _size_matches(text, measured, size) else "incomplete"


def _text_status(text, size):
    """U+FFFD means the tool decoded a non-UTF-8 file (e.g. Windows-1252): checked before the
    size, because re-sending the same file can't fix it."""
    return "not_utf8" if REPLACEMENT in text else _measured_status(text, size)


def _csv_status(text, size):
    return _text_status(text, size) if isinstance(text, str) else "unavailable"


def _csv_result(data, size):
    text = data.get("content") if data else None
    status = _csv_status(text, size)
    return {"status": status, "text": text if status == "ok" else None}


def read_csv_attachment(attachment, title):
    """{"status", "text"}: "ok" with the text as fetched; "invalid_attachment" (no call made:
    ask for one CSV); "unavailable" (the tool failed: our side); "not_utf8" (replacement
    characters) and "unreadable" (lone surrogates): save as CSV UTF-8; "incomplete" (size
    mismatch: re-send). Call it once per run, for exactly one attachment."""
    if not _csv_attachment(attachment):
        return {"status": "invalid_attachment", "text": None}
    body = call_platform("create_csv_canvas", title=title, csv_urls=[attachment["url"]])
    return _csv_result(body, attachment["size_bytes"])
