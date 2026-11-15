import read_and_check
import report
from builders import EXAMPLE_ALLOWED, error, ok
from report_support import (
    CANVAS_URL,
    by_webhook,
    calls_to,
    fixed_now,
    names,
    scored_after,
    write,
)
from step_builders import (
    ROWS,
    a_csv,
    a_ctx,
    a_finding,
    a_fix,
    a_package,
    a_review,
    a_rule_check,
    a_tool_report,
    attach,
    ok_body,
)

UNSURE = a_finding("currency_code", "warning", "unsure", detail="Is CHF 30 the same price?")
SPELLING = a_finding("locale_spelling", "warning", detail="Use the market spelling.")
NUMBERS = a_finding("numbers")


def in_chat(fake_tools, tmp_path, raw):
    ctx = attach(tmp_path, "Black Friday 2026.csv", raw)
    fake_tools.respond("localization_check", ok_body(a_tool_report(a_package())))
    checked = read_and_check.handler({"trigger_name": "Chat"}, ctx)
    return ctx, scored_after(fake_tools, ctx, checked)


CLEAN_EMAIL = (
    "Overall: No issues found by automated checks.\n\n"
    "- de-DE: No issues found by automated checks\n\n"
    f"Detailed report: {CANVAS_URL}\n\n"
    "A language passes only when every check ran and nothing blocks it.\n\n"
    "Checked against market rules v1.0 (effective 2026-11-13).\n\n"
    "Screening aid, not linguistic or legal sign-off."
)


def test_webhook_runs_email_the_qa_inbox(fake_tools, tmp_path):
    ctx = a_ctx(tmp_path)
    out = write(fake_tools, ctx, by_webhook(fake_tools, ctx))
    subject = "Translation Launch Check - Black Friday 2026: No issues found by automated checks"
    assert calls_to(fake_tools, "send_email") == [
        {"recipient_emails": EXAMPLE_ALLOWED, "subject": subject, "body": CLEAN_EMAIL}
    ]
    assert out["emailed"] is True


def test_chat_runs_send_no_email(fake_tools, tmp_path):
    ctx, scored = in_chat(fake_tools, tmp_path, a_csv())
    out = write(fake_tools, ctx, scored)
    assert calls_to(fake_tools, "send_email") == [] and out["emailed"] is False
    assert "couldn't be sent" not in out["message"]


def test_an_address_inside_the_copy_is_never_emailed(fake_tools, tmp_path):
    rows = [[*ROWS[0][:4], "Schreib an owner@example.com"], ROWS[1]]
    ctx, scored = in_chat(fake_tools, tmp_path, a_csv(rows=rows))
    write(fake_tools, ctx, scored)
    assert calls_to(fake_tools, "send_email") == []


def test_an_email_that_wasnt_sent_is_said(fake_tools, tmp_path):
    ctx = a_ctx(tmp_path)
    scored = by_webhook(fake_tools, ctx)
    fake_tools.respond("create_canvas", ok({"artifact_url": CANVAS_URL}))
    fake_tools.respond("send_email", ok({"status": "pending"}))
    out = report.impl(scored, ctx, fixed_now)
    assert out["emailed"] is False and out["message"].endswith(
        "\n\nThe report email to the QA inbox couldn't be sent."
    )


def test_canvas_failure_still_answers(fake_tools, tmp_path):
    ctx = a_ctx(tmp_path)
    scored = by_webhook(fake_tools, ctx)
    fake_tools.respond("create_canvas", error(500))
    fake_tools.respond("send_email", ok({"status": "sent"}))
    out = report.impl(scored, ctx, fixed_now)
    assert (
        out["canvas_url"] is None
        and "The detailed report couldn't be saved; re-run the check to get it." in out["message"]
    )


HUMAN_LINE = "- de-DE: No blocking issues found by automated checks, 1 item needs a human look"
HUMAN_BLOCK = (
    "de-DE - needs a human look:\n- L1 (currency\\_code): Is CHF 30 the same price?\n"
    "  - Master: Up to 30% off jackets\n  - Translation: Bis zu 30 % auf Jacken\n"
    "  - Reviewer: likely the same meaning, written differently"
    " - Same price, written differently.\n\n"
)


def same_meaning(item):
    return a_review(item, rule_checks=[a_rule_check("R1")])


def test_needs_a_human_look_shows_the_copy_the_question_and_the_opinion(fake_tools, tmp_path):
    ctx = a_ctx(tmp_path)
    report_ = a_tool_report(a_package(), {("de-DE", "L1"): [UNSURE]})
    text = write(fake_tools, ctx, by_webhook(fake_tools, ctx, report_, same_meaning))["message"]
    assert HUMAN_LINE in text and HUMAN_BLOCK in text


def test_a_spelling_fix_is_shown_and_rechecked(fake_tools, tmp_path):
    ctx = a_ctx(tmp_path)
    report_ = a_tool_report(a_package(), {("de-DE", "L1"): [SPELLING]})
    report_["locales"][0]["lines"][0]["spelling_fix"] = "Bis zu 30 % auf Jacken!"
    scored = by_webhook(fake_tools, ctx, report_)
    fake_tools.respond("localization_check", ok_body(a_tool_report(a_package())))
    text = write(fake_tools, ctx, scored)["message"]
    assert "- de-DE L1: Bis zu 30 % auf Jacken\\! (spelling fix, passes the rule checks)" in text


FIXES_TEXT = (
    '{"fixes": [{"locale": "de-DE", "line_id": "L2", "suggested_text": "x"}, '
    '{"locale": "de-DE", "line_id": "L1", "suggested_text": "Bis zu 30 %"}, '
    '{"locale": "de-DE", "line_id": "L1", "suggested_text": "second"}]}'
)


def test_fixes_as_json_text_count_and_only_for_lines_sent(fake_tools, tmp_path):
    ctx = a_ctx(tmp_path)
    scored = by_webhook(fake_tools, ctx, a_tool_report(a_package(), {("de-DE", "L1"): [NUMBERS]}))
    text = write(fake_tools, ctx, scored, FIXES_TEXT)["message"]
    assert "Top fixes:\n- de-DE L1: Bis zu 30 % (" in text
    assert "L2: x" not in text and "second" not in text


def test_unusable_fixes_are_ignored(fake_tools, tmp_path):
    ctx = a_ctx(tmp_path)
    scored = by_webhook(fake_tools, ctx, a_tool_report(a_package(), {("de-DE", "L1"): [NUMBERS]}))
    fake_tools.calls.clear()
    bad = [a_fix(text=" "), a_fix(text="x" * 1001), a_fix(text=None), "L1: Bis zu 30 %"]
    text = write(fake_tools, ctx, scored, {"fixes": bad})["message"]
    assert "Top fixes:" not in text and "localization_check" not in names(fake_tools)


def test_prints_nothing_and_never_fails(fake_tools, tmp_path, capsys):
    ctx = a_ctx(tmp_path)
    write(fake_tools, ctx, by_webhook(fake_tools, ctx))
    failed = report.handler(None, ctx)
    assert failed["message"] == "Something went wrong writing the report. Please re-run the check."
    assert capsys.readouterr() == ("", "")
