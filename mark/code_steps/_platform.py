"""Helpers for the platform's own tools, each checking that tool's fields (inlined at build).

The status-token rule of call_tool is for our own tool only. Nothing here raises or prints.
"""

import unicodedata

from _address import on_allow_list
from _config import PRIVATE
from _shared import call_platform

SEPARATORS = frozenset("\u2028\u2029")  # line and paragraph separators (Zl, Zp)
UNSAFE_CATEGORIES = ("Cc", "Cf", "Cs")
BOM = "\ufeff"


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
