"""Route tokens and the reserved prefix: what conditions match, and the one place copy and
model text are tested for the prefix and defused. Standard library only (no SDK, no private
config), so the parse chain also runs outside Mark (scripts/send_package.py)."""

import re
import unicodedata

ROUTE_PREFIX = "tlc_route_"  # reserved: rejected in user copy, so copy can't steer a condition
ROUTE_NEEDS_INFO = ROUTE_PREFIX + "needs_info"
ROUTE_CHECK = ROUTE_PREFIX + "check"
ROUTE_FIX = ROUTE_PREFIX + "fix"
ROUTE_REPORT = ROUTE_PREFIX + "report"
ROUTE_WORD = re.compile(re.escape(ROUTE_PREFIX), re.IGNORECASE)
DEFUSED_PREFIX = "tlc-route-"
DROPPED_CATEGORIES = ("Cc", "Cf")  # controls; bidi and zero-width format characters


def without_controls(text):
    """The text as it reads: control and format characters (a zero-width space or a soft
    hyphen hidden inside the prefix) removed."""
    return "".join(char for char in text if unicodedata.category(char) not in DROPPED_CATEGORIES)


def has_route_word(text):
    """The reserved prefix, in any case, also with invisible characters inside it: user copy
    may never carry it."""
    return ROUTE_WORD.search(without_controls(text)) is not None


def defused(text):
    """Text that can't form a route token: the prefix, in any case, becomes DEFUSED_PREFIX.
    Every echo of user or model text into a step output goes through this."""
    return ROUTE_WORD.sub(DEFUSED_PREFIX, text)
