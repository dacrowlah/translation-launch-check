"""Reading a chat attachment through create_csv_canvas (a platform tool), kept apart from
_platform so the steps that only send email, save a canvas or write a file don't carry it.
Not used by a step today: the workflow reads attachments from disk (read_and_check). Nothing
here raises or prints."""

import re

from _config import RULES
from _platform import BOM
from _shared import call_platform

MAX_FILE_BYTES = RULES["limits"]["max_file_bytes"]
GS_URL = re.compile(r"gs://[a-z0-9._-]+/[^\s?#]+")  # the recorded shape only
REPLACEMENT = "\ufffd"
BOM_BYTES = 3  # a UTF-8 BOM, counted in size_bytes


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
