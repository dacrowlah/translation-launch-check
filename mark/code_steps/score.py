"""Step "Score each language": reads the facts of "Read and check the file" and each saved
review from the run folder (it takes no loop output), binds every review to its language,
merges rule and review findings, computes each verdict in code, picks the lines to fix and
writes scores.json for the report.

Inputs (Automatic): run_key and check_checksum from "Read and check the file".
Returns {route: tlc_route_fix | tlc_route_report, outcome, run_key, verdict_checksum,
fix_input, found, found_total, summary}. `found` lists every finding that counts as
"<locale> <line_id> <check>", for the seeded catch-rate script (it reads the run log). If
the facts can't be read, or this step fails, the route is tlc_route_report with outcome
check_incomplete and no verdict_checksum: the report then says "re-run".
"""

from _checksum import facts_checksum
from _fix_input import fix_input, lines_to_fix, within_cap
from _routes import ROUTE_FIX, ROUTE_REPORT
from _run_folder import (
    CHECK_FILE,
    SCORES_FILE,
    read_review,
    read_verified,
    run_root,
    write_run_file,
)
from _scoring import found_list, score_locale
from _shared import run_safely
from _text import TEXT
from _verdict import overall

COPIED = ("campaign", "source", "notify_email", "rules_version")


def incomplete(run_key=None):
    summary = TEXT["summary_scored"].format(outcome="check_incomplete")
    head = {"route": ROUTE_REPORT, "outcome": "check_incomplete", "run_key": run_key}
    empty = {"fix_input": "", "found": [], "found_total": 0}
    return {**head, "verdict_checksum": None, **empty, "summary": summary}


def _scored_locale(facts, check, place):
    saved = read_review(place["run_key"], facts["locale"], facts["checksum"], root=place["root"])
    return score_locale(facts, check["master_lines"], saved)


def _fix_plan(locales):
    """The lines for the fixer, and how many past its input cap get no suggestion."""
    wanted = lines_to_fix(locales)
    to_fix = within_cap(wanted)
    return {"lines_to_fix": to_fix, "unfixed_lines": len(wanted) - len(to_fix)}


def scores_of(check, place):
    locales = [_scored_locale(facts, check, place) for facts in check["locales"]]
    outcome = overall([scored["verdict"] for scored in locales])
    copied = {key: check[key] for key in COPIED}
    unsent = {"unsent_checks": sum(facts["unsent_checks"] for facts in check["locales"])}
    return {**copied, **unsent, "outcome": outcome, "locales": locales, **_fix_plan(locales)}


def _scored_output(scores, checksum, run_key):
    route = ROUTE_FIX if scores["lines_to_fix"] else ROUTE_REPORT
    head = {"route": route, "outcome": scores["outcome"], "run_key": run_key}
    text = {"fix_input": fix_input(scores["lines_to_fix"]), **found_list(scores["locales"])}
    summary = TEXT["summary_scored"].format(outcome=scores["outcome"])
    return {**head, "verdict_checksum": checksum, **text, "summary": summary}


def _route(scores, place):
    if write_run_file(place["run_key"], SCORES_FILE, scores, root=place["root"]) != "ok":
        return incomplete(place["run_key"])
    return _scored_output(scores, facts_checksum(scores), place["run_key"])


def score(input_, ctx):
    place = {"run_key": input_.get("run_key"), "root": run_root(ctx)}
    check = read_verified(
        place["run_key"], CHECK_FILE, input_.get("check_checksum"), root=place["root"]
    )
    return (
        _route(scores_of(check["data"], place), place) if check["status"] == "ok" else incomplete()
    )


def handler(input: dict, ctx: dict) -> dict:  # noqa: A002 - the platform's signature
    return run_safely(score, input, ctx, incomplete())
