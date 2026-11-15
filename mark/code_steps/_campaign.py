"""The campaign name: echoed into the canvas name, the email subject and the report, so it is
reduced to letters, digits, spaces, "_" and "-". Format (Cf), private-use (Co), unassigned
(Cn) and control characters go, and so do characters that draw as nothing although Unicode
calls them letters or symbols. Nothing here raises."""

import unicodedata
from pathlib import PurePath

MAX_CAMPAIGN = 60
UNTITLED = "Untitled campaign"
KEPT_PUNCTUATION = frozenset("_-")
# Letters (Lo) and a symbol (So) that render blank: Hangul fillers, Braille blank.
BLANK_LOOKALIKES = frozenset("\u3164\u115f\u1160\uffa0\u2800")


def _campaign_char(char):
    """The character as kept: itself, a plain space for any space separator, or ""."""
    category = unicodedata.category(char)
    if category == "Zs":
        return " "
    letter_or_digit = category[0] in "LN" and char not in BLANK_LOOKALIKES
    return char if letter_or_digit or char in KEPT_PUNCTUATION else ""


def clean_campaign(text):
    """One line of at most MAX_CAMPAIGN kept characters, spaces collapsed; UNTITLED if
    nothing is left or the value isn't text."""
    normalized = unicodedata.normalize("NFC", text) if isinstance(text, str) else ""
    kept = "".join(_campaign_char(char) for char in normalized)
    short = " ".join(kept.split())[:MAX_CAMPAIGN].rstrip()
    return short or UNTITLED


def campaign_from(file_name):
    """The file name without its folder and extension, cleaned."""
    return clean_campaign(PurePath(file_name).stem if isinstance(file_name, str) else "")
