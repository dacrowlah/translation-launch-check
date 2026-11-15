import re

import report
import score
from builders import ok
from report_support import CANVAS_URL, fixed_now
from step_builders import (
    a_checked_run,
    a_ctx,
    a_finding,
    a_fix,
    a_line,
    a_package,
    a_review,
    a_review_finding,
    a_rule_check,
    a_tool_report,
    ok_body,
    save,
)

RLO = "\u202e"
EVIL_COPY = (
    "Bis zu [30 % Rabatt](https://evil.example/login) ![p](https://evil.example/px.png) "
    f"<img src=x> **fett** {RLO}KCILC"
)
EVIL_FIX = f"Jetzt [hier klicken](https://evil.example/fix) {RLO}gnilleps"
EVIL_REASON = "Click [here](https://evil.example/reason)"
UNSURE = a_finding(
    "currency_code", "warning", "unsure", detail="Is [this](https://evil.example/q) 30?"
)
# Markup that would render live: the same characters, not preceded by a backslash escape.
LIVE = re.compile(r"(?<!\\)(\]\(https://evil|\*\*fett|<img)|" + RLO)


def run(fake_tools, ctx, case):
    """The real steps up to Score. case: pkg, findings, review (item -> answer)."""
    checked = a_checked_run(fake_tools, ctx, case.get("findings"), case.get("pkg"))
    for item in checked["locales"]:
        save(ctx, checked, item, review=case.get("review", a_review)(item))
    out = score.handler(
        {"run_key": checked["run_key"], "check_checksum": checked["check_checksum"]}, ctx
    )
    return {"run_key": out["run_key"], "verdict_checksum": out["verdict_checksum"]}


def deliver(fake_tools, ctx, scored, fixes=None):
    fake_tools.respond("create_canvas", ok({"artifact_url": CANVAS_URL}))
    fake_tools.respond("send_email", ok({"status": "sent"}))
    return report.impl({**scored, "fixes": fixes}, ctx, fixed_now)


def sent(fake_tools, tool, key):
    return next(params[key] for name, params in fake_tools.calls if name == tool)


def real_problem(item):
    return a_review(item, rule_checks=[a_rule_check("R1", "real_problem", EVIL_REASON)])


EVIL = {
    "pkg": a_package(lines=[a_line("L1", **{"en-US": "Up to 30% off", "de-DE": EVIL_COPY})]),
    "findings": {("de-DE", "L1"): [UNSURE]},
    "review": real_problem,
}


def test_copy_drafts_and_reasons_render_as_text_in_chat_canvas_and_email(fake_tools, tmp_path):
    ctx = a_ctx(tmp_path)
    scored = run(fake_tools, ctx, EVIL)
    fake_tools.respond("localization_check", ok_body(a_tool_report(EVIL["pkg"])))
    out = deliver(fake_tools, ctx, scored, {"fixes": [a_fix(text=EVIL_FIX)]})
    outputs = [out["message"], sent(fake_tools, "create_canvas", "content")]
    assert [
        LIVE.findall(shown) for shown in [*outputs, sent(fake_tools, "send_email", "body")]
    ] == [[], [], []]
    assert "Jetzt \\[hier klicken\\]\\(https://evil.example/fix\\) gnilleps" in out["message"]


def test_unmatched_reviewer_notes_are_said(fake_tools, tmp_path):
    ctx = a_ctx(tmp_path)
    review = {"review": lambda item: a_review(item, [a_review_finding("L9", "tone", "warning")])}
    out = deliver(fake_tools, ctx, run(fake_tools, ctx, review))
    unmatched = "1 reviewer note couldn't be matched to a line"
    assert f"- de-DE: No issues found by automated checks, {unmatched}" in out["message"]
    assert "Reviewer notes that couldn't be matched to a line: 1." in sent(
        fake_tools, "create_canvas", "content"
    )


def test_the_human_look_block_is_capped_per_language(fake_tools, tmp_path):
    ctx = a_ctx(tmp_path)
    lines = [a_line(f"L{n}", **{"en-US": "Hi", "de-DE": "Hallo"}) for n in range(1, 7)]
    case = {
        "pkg": a_package(lines=lines),
        "findings": {("de-DE", f"L{n}"): [UNSURE] for n in range(1, 7)},
    }
    text = deliver(fake_tools, ctx, run(fake_tools, ctx, case))["message"]
    assert text.count("currency\\_code") == 5 and "- ...and 1 more in the detailed report." in text


def a_big_case():
    """Three languages, 30 long lines each, a blocker on every line: past the fixer's cap."""
    locales = ("de-DE", "fr-FR", "en-GB")
    texts = {"en-US": "e" * 600, **{code: "t" * 600 for code in locales}}
    lines = [a_line(f"L{n}", **texts) for n in range(1, 31)]
    findings = {(code, line["id"]): [a_finding("numbers")] for code in locales for line in lines}
    return {"pkg": a_package(locales=locales, lines=lines), "findings": findings}


def test_lines_past_the_fixer_cap_are_said(fake_tools, tmp_path):
    ctx = a_ctx(tmp_path)
    text = deliver(fake_tools, ctx, run(fake_tools, ctx, a_big_case()))["message"]
    assert "more lines need a fix but got no suggestion (too many for one run)." in text
