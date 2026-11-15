"""Untrusted text (copy, the campaign name, the tool's details, the agents' drafts, reasons
and notes) as it is shown in the chat reply, the canvas and the email: Markdown and HTML
syntax is escaped so links, images, emphasis, headings, tables and tags render as text;
format and control characters (bidi overrides, zero-width characters) are removed; and the
route prefix is defused. The email gets the same text unescaped (plain_text). Nothing here
raises."""

from _routes import defused, without_controls

MARKDOWN_PUNCTUATION = frozenset("\\`*_[]()!#|~<>&")
MAX_SHOWN = 200  # characters of copy per line in the chat reply and the email


def plain_text(text):
    """One piece of untrusted text for plain text (the email): controls and format
    characters dropped, then the route prefix defused, nothing escaped."""
    raw = "" if text is None else str(text)
    return defused(without_controls(raw))  # stripped first: a hidden "tlc_\u200broute_" too


def md_text(text):
    """One piece of untrusted text, safe to place inline in Markdown. Line breaks are the
    caller's job (they are controls, so they are dropped here)."""
    return "".join("\\" + c if c in MARKDOWN_PUNCTUATION else c for c in plain_text(text))


def one_line(text, limit=MAX_SHOWN):
    """Copy as one short line: whitespace collapsed, cut at `limit` with an ellipsis."""
    flat = " ".join(str(text).split()) if text is not None else ""
    return flat if len(flat) <= limit else flat[: limit - 3].rstrip() + "..."


def safe(text, limit=MAX_SHOWN):
    """Untrusted text for the chat reply: one short line, Markdown escaped."""
    return md_text(one_line(text, limit))


def plain(text, limit=MAX_SHOWN):
    """Untrusted text for the plain-text email: one short line, controls dropped."""
    return plain_text(one_line(text, limit))
