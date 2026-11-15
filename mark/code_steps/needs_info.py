"""Step "Ask for a corrected file": lists every problem "Read and check the file" found, each
with its suggestion, and links the CSV template. No canvas, no email.

Input (Automatic): problems ([{where, message, suggestion}] from "Read and check the file").
They pass through the orchestrator model, so each field is checked and shortened here.
Returns {message, summary}.
"""

from _config import PRIVATE
from _markdown import safe
from _shared import run_safely
from _text_needs_info import NEEDS_INFO
from _text_problems import MAX_SHOWN_PROBLEMS, PROBLEM_FIELD_CHARS, our_side

MAX_PROBLEMS = MAX_SHOWN_PROBLEMS + 1  # and the line counting the rest
NOT_RUN = {"message": NEEDS_INFO["not_run"], "summary": NEEDS_INFO["not_run_summary"]}


def _field(problem, key):
    """One field as shown: one short line, Markdown escaped (it may echo the file)."""
    value = problem.get(key)
    return safe(value, PROBLEM_FIELD_CHARS) if isinstance(value, str) else ""


def _problem_line(problem):
    if not isinstance(problem, dict) or not _field(problem, "message"):
        return None
    named = {key: _field(problem, key) for key in ("where", "message", "suggestion")}
    return NEEDS_INFO["problem" if named["where"] else "problem_nowhere"].format(**named).rstrip()


def _problem_lines(given):
    found = map(_problem_line, given[:MAX_PROBLEMS]) if isinstance(given, list) else []
    return [line for line in found if line]


def _corrected_file_request(given):
    lines = _problem_lines(given)
    head = [NEEDS_INFO["intro"], *lines] if lines else [NEEDS_INFO["none"]]
    template = NEEDS_INFO["template"].format(url=PRIVATE["template_url"])
    summary = NEEDS_INFO["summary"].format(count=len(lines))
    return {"message": "\n".join(head) + "\n\n" + template, "summary": summary}


def ask_for_a_corrected_file(input_, ctx):
    """Our side failing (the tool, the platform) gets a neutral line: no template, nothing
    asked of the file."""
    given = input_.get("problems")
    return (
        dict(NOT_RUN)
        if isinstance(given, list) and our_side(given)
        else _corrected_file_request(given)
    )


def handler(input: dict, ctx: dict) -> dict:  # noqa: A002 - the platform's signature
    return run_safely(ask_for_a_corrected_file, input, ctx, _corrected_file_request(None))
