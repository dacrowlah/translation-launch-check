"""Code-step budgets. Mark's code-step event holds the step's code and its input, at most
75,776 bytes (2026-11, tiny input: 68,200 and 70,700 bytes of code ran; 73,200 and more
failed with exit_code=-1 and no message). Rule: the JSON-escaped code plus the escaped
input (json_size) stays at most STEP_LIMIT, leaving about 5 KB for Mark's own overhead.
CODE_CEILINGS hold each built step's escaped code size, with a little headroom; build.py
refuses a step over its ceiling or over MAX_CODE_BYTES, so input_budget holds for the code
that ships.

Agent answers feed code steps (the review into "Save the review", the fixes into "Write and
send the report"), so their output schemas bound them (REVIEW_BOUNDS, FIX_BOUNDS, pinned
against the schemas by a test) and the allowances below derive from those bounds. Standard
library only: the webhook sender imports it too."""

STEP_LIMIT = 68_000
MAX_CODE_BYTES = 60_000
CODE_CEILINGS = {
    "read_and_check": 40_000,
    "save_review": 10_000,
    "score": 24_000,
    "report": 42_000,
    "needs_info": 21_000,
}
ESCAPED = 6  # a non-ASCII character escapes to \uXXXX
REVIEW_BOUNDS = {"findings": 20, "line_id": 40, "detail": 240, "evidence": 120}
REVIEW_BOUNDS |= {"rule_checks": 20, "finding_id": 40, "reason": 200}
FIX_BOUNDS = {"fixes": 60, "line_id": 40, "suggested_text": 1000, "note": 240}
KEYS = 120  # an answer object's keys, quotes, enums and locale


def input_budget(step):
    """The most escaped JSON a step's whole input may hold, in bytes."""
    return STEP_LIMIT - CODE_CEILINGS[step]


def _finding_bytes():
    """detail and the ids in English; evidence quotes the copy, so it may all be escaped."""
    bounds = REVIEW_BOUNDS
    return bounds["line_id"] + bounds["detail"] + ESCAPED * bounds["evidence"] + KEYS


def review_allowance():
    """The largest review the schema admits, escaped: every finding and second opinion at
    its bound."""
    opinion = REVIEW_BOUNDS["finding_id"] + REVIEW_BOUNDS["reason"] + KEYS
    return (
        REVIEW_BOUNDS["findings"] * _finding_bytes() + REVIEW_BOUNDS["rule_checks"] * opinion + KEYS
    )


def fix_overhead():
    """A fix's bytes besides its draft: the note and line id at their bounds, and the keys."""
    return FIX_BOUNDS["note"] + FIX_BOUNDS["line_id"] + KEYS
