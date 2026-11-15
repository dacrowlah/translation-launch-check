"""Step "Write and send the report": reads scores.json (bound to verdict_checksum), re-checks
the suggested fixes with one localization_check call, saves the canvas, emails the
QA inbox when the run has one (allow-list enforced in code), and returns the final message.

Inputs (Automatic): run_key and verdict_checksum from "Score each language", and on the fix
path fixes (Translation Fix Suggestions' output: {fixes: [{locale, line_id, suggested_text,
fits, note}]}, as an object or JSON text, or inside the agent's execution record). Returns
{message, canvas_url, emailed, outcome, summary}. The message is the workflow's answer: it
states the outcome and the rule.
"""

from datetime import UTC, datetime

from _campaign import clean_campaign
from _canvas import render
from _fixes import rechecked, suggested_fixes
from _message import message
from _platform import allowed_recipient, create_canvas, send_email
from _report_view import label
from _run_folder import SCORES_FILE, read_verified, run_root
from _shared import run_safely
from _text_report import REPORT

RUN_TIME = "%Y-%m-%d %H:%M UTC"


def _answer(text, canvas_url, emailed, outcome):
    summary = REPORT["summary"].format(outcome=outcome)
    delivery = {"canvas_url": canvas_url, "emailed": emailed}
    return {"message": text, **delivery, "outcome": outcome, "summary": summary}


FALLBACK = {
    **_answer(REPORT["failed"], None, False, "check_incomplete"),
    "summary": REPORT["failed_summary"],
}


def _unreadable():
    """The scores didn't verify: say re-run, show no fixes, send nothing."""
    text = "\n\n".join([REPORT["overall_unreadable"], REPORT["rule"], REPORT["footer"]])
    return _answer(text, None, False, "check_incomplete")


def _canvas(scores, fixes, place):
    run_time = place["now"]().strftime(RUN_TIME)
    named = {"campaign": clean_campaign(scores["campaign"]), "run_time": run_time}
    name = REPORT["canvas_name"].format(**named, key=place["run_key"][:6])
    return {"name": name, "url": create_canvas(name, render(scores, fixes, run_time))}


def _subject(scores):
    named = {"campaign": clean_campaign(scores["campaign"]), "label": label(scores["outcome"])}
    return REPORT["subject"].format(**named)


def _emailed(scores, text):
    """Only to a recipient on the allow-list, checked here and again in send_email."""
    recipient = scores["notify_email"]
    allowed = recipient is not None and allowed_recipient(recipient)
    return send_email(recipient, _subject(scores), text) if allowed else False


def _delivered(scores, fixes, place):
    canvas = _canvas(scores, fixes, place)
    text = message(scores, fixes, canvas)
    emailed = _emailed(scores, text)
    note = "\n\n" + REPORT["email_failed"] if scores["notify_email"] and not emailed else ""
    return _answer(text + note, canvas["url"], emailed, scores["outcome"])


def _scores(input_, ctx):
    checksum = input_.get("verdict_checksum")
    return read_verified(input_.get("run_key"), SCORES_FILE, checksum, root=run_root(ctx))


def impl(input_, ctx, now):
    stored, place = _scores(input_, ctx), {"run_key": input_.get("run_key"), "now": now}
    if stored["status"] != "ok":
        return _unreadable()
    fixes = rechecked(stored["data"], suggested_fixes(stored["data"], input_.get("fixes")))
    return _delivered(stored["data"], fixes, place)


def _utc_now():
    return datetime.now(UTC)


def _with_clock(input_, ctx):
    return impl(input_, ctx, _utc_now)


def handler(input: dict, ctx: dict) -> dict:  # noqa: A002 - the platform's signature
    return run_safely(_with_clock, input, ctx, FALLBACK)
