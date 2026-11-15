"""Untrusted text (copy, the campaign name, the tool's details, the agents' drafts, reasons
and notes) as it is shown in the chat reply, the canvas and the email: Markdown and HTML
syntax is escaped so links, images, emphasis, headings, tables and tags render as text;
format and control characters (bidi overrides, zero-width characters) are removed; and the
route prefix is defused. Nothing here raises."""

import unicodedata

from _routes import defused

MARKDOWN_PUNCTUATION = frozenset("\\`*_[]()!#|~<>&")
DROPPED_CATEGORIES = ("Cc", "Cf")  # controls; bidi and zero-width format characters


def _shown_char(char):
    if unicodedata.category(char) in DROPPED_CATEGORIES:
        return ""
    return "\\" + char if char in MARKDOWN_PUNCTUATION else char


def md_text(text):
    """One piece of untrusted text, safe to place inline in Markdown. Line breaks are the
    caller's job (they are controls, so they are dropped here)."""
    raw = "" if text is None else defused(str(text))
    return "".join(_shown_char(char) for char in raw)
