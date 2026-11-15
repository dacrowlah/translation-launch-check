import json

import report
from _budgets import REVIEW_BOUNDS
from builders import FILE_LINK, an_execution_record, error
from report_support import CANVAS_URL, fixed_now, names, write
from step_builders import (
    a_ctx,
    a_finding,
    a_fix,
    a_line,
    a_package,
    a_scored_run,
    a_tool_report,
    ok_body,
)

NUMBERS = a_finding("numbers", expected="30%", found="20 %", detail="The number differs.")
THREE = ("de-DE", "fr-FR", "ja-JP")
TWO_BLOCKED = {("de-DE", "L1"): [NUMBERS], ("fr-FR", "L2"): [NUMBERS]}
BLOCKED_AND_WARNED = {("de-DE", "L1"): [NUMBERS, a_finding("formality", "warning")]}
FR_FIX = a_fix("fr-FR", "L2", "Bonjour {{first_name}}")
CANVAS_NAME = "Translation Launch Check - Black Friday 2026 - 2026-11-12 09:30 UTC"


def recheck_answers(fake_tools, lines, findings=None, locales=("de-DE",)):
    pkg = a_package(locales=locales, lines=lines)
    fake_tools.respond("localization_check", ok_body(a_tool_report(pkg, findings)))


def fixed_line(line_id="L1", text="Bis zu 30 % auf alle Jacken"):
    return a_line(line_id, **{"en-US": "Up to 30% off jackets", "de-DE": text})


def two_of(fake_tools, ctx, locales):
    """A scored run where de-DE L1 and fr-FR L2 each have a blocker."""
    return a_scored_run(fake_tools, ctx, TWO_BLOCKED, a_package(locales=locales))


def test_message_for_fix_first(fake_tools, tmp_path):
    ctx = a_ctx(tmp_path)
    lines = write(fake_tools, ctx, two_of(fake_tools, ctx, THREE))["message"].splitlines()
    assert lines[0] == "Overall: Fix first. 2 of 3 languages need fixes before launch."
    assert lines[2:4] == ["- de-DE: Fix first (1 blocker)", "- fr-FR: Fix first (1 blocker)"]
    assert lines[4] == "- ja-JP: No issues found by automated checks"


WHOLE_MESSAGE = (
    "Overall: Fix first. 1 of 1 languages need fixes before launch.\n\n"
    "- de-DE: Fix first (1 blocker, 1 warning)\n\n"
    "Top fixes:\n- de-DE L1: Bis zu 30 % auf alle Jacken (passes the rule checks)\n"
    "Corrected file (1 fix applied, re-checked): [Download]({file})\n\n"
    "Detailed report: [{name}]({url})\n\n"
    "A language passes only when every check ran and nothing blocks it.\n\n"
    "Checked against market rules v1.0 (effective 2026-11-13).\n\n"
    "Screening aid, not linguistic or legal sign-off."
)


def test_the_whole_message_for_one_fixed_language(fake_tools, tmp_path):
    ctx = a_ctx(tmp_path)
    scored = a_scored_run(fake_tools, ctx, BLOCKED_AND_WARNED)
    recheck_answers(fake_tools, [fixed_line()])
    name = f"{CANVAS_NAME} - {scored['run_key'][:6]}"
    message = write(fake_tools, ctx, scored, {"fixes": [a_fix()]})["message"]
    assert message == WHOLE_MESSAGE.format(name=name, url=CANVAS_URL, file=FILE_LINK)


def test_findings_past_the_second_opinion_bound_are_counted(fake_tools, tmp_path):
    ctx = a_ctx(tmp_path)
    many = {("de-DE", "L1"): [NUMBERS] * (REVIEW_BOUNDS["rule_checks"] + 2)}
    message = write(fake_tools, ctx, a_scored_run(fake_tools, ctx, many))["message"]
    note = "2 more findings weren't sent for a second opinion (too many for one run)."
    assert f"\n\n{note}\n\n" in message


def test_fixes_passed_as_the_agents_execution_record_are_used(fake_tools, tmp_path):
    ctx = a_ctx(tmp_path)
    scored = a_scored_run(fake_tools, ctx, BLOCKED_AND_WARNED)
    recheck_answers(fake_tools, [fixed_line()])
    record = json.dumps(an_execution_record(json.dumps({"fixes": [a_fix()]})))
    message = write(fake_tools, ctx, scored, record)["message"]
    assert "Top fixes:\n- de-DE L1: Bis zu 30 % auf alle Jacken (passes the rule checks)" in message


def test_ready_is_never_called_approved(fake_tools, tmp_path):
    ctx = a_ctx(tmp_path)
    out = write(fake_tools, ctx, a_scored_run(fake_tools, ctx))
    text = out["message"]
    assert out["outcome"] == "ready" and "No issues found by automated checks" in text
    assert "approved" not in text.lower() and "ready to launch" not in text.lower()
    assert "Checked against market rules v1.0 (effective 2026-11-13)." in text


def test_canvas_name_is_unique_per_run(fake_tools, tmp_path):
    ctx = a_ctx(tmp_path)
    scored = a_scored_run(fake_tools, ctx)
    out = write(fake_tools, ctx, scored)
    params = next(params for name, params in fake_tools.calls if name == "create_canvas")
    assert params["name"] == f"{CANVAS_NAME} - {scored['run_key'][:6]}"
    assert params["mime_type"] == "text/markdown" and out["canvas_url"] == CANVAS_URL
    assert params["content"].startswith("# Translation Launch Check - Black Friday 2026")


def test_tampered_verdict_is_incomplete(fake_tools, tmp_path):
    ctx = a_ctx(tmp_path)
    scored = a_scored_run(fake_tools, ctx, {("de-DE", "L1"): [NUMBERS]})
    fake_tools.reset()
    tampered = {**scored, "verdict_checksum": "0" * 16, "fixes": {"fixes": [a_fix()]}}
    out = report.impl(tampered, ctx, fixed_now)
    first = "Overall: Check incomplete - re-run. The results couldn't be read back."
    assert out["message"].splitlines()[0] == first and fake_tools.calls == []
    assert (out["outcome"], out["canvas_url"], out["emailed"]) == ("check_incomplete", None, False)


def test_fixes_are_rechecked_with_one_call_for_all(fake_tools, tmp_path):
    ctx = a_ctx(tmp_path)
    scored = two_of(fake_tools, ctx, ("de-DE", "fr-FR"))
    fake_tools.calls.clear()
    write(fake_tools, ctx, scored, {"fixes": [a_fix(), FR_FIX]})
    assert names(fake_tools).count("localization_check") == 1


def test_the_recheck_sends_each_fixed_line_with_its_fix(fake_tools, tmp_path):
    ctx = a_ctx(tmp_path)
    scored = two_of(fake_tools, ctx, ("de-DE", "fr-FR"))
    write(fake_tools, ctx, scored, {"fixes": [a_fix(), FR_FIX]})
    sent = [params for name, params in fake_tools.calls if name == "localization_check"][-1]
    assert sent["locales"] == ["de-DE", "fr-FR"] and [line["id"] for line in sent["lines"]] == [
        "L1",
        "L2",
    ]
    texts = {"en-US": "Hi {{first_name}}", "de-DE": "Hallo {{first_name}}"}
    assert sent["lines"][1]["texts"] == {**texts, "fr-FR": "Bonjour {{first_name}}"}


def test_a_fix_that_still_fails_is_marked(fake_tools, tmp_path):
    ctx = a_ctx(tmp_path)
    scored = a_scored_run(fake_tools, ctx, {("de-DE", "L1"): [NUMBERS]})
    recheck_answers(
        fake_tools, [fixed_line()], {("de-DE", "L1"): [NUMBERS, a_finding("typography", "info")]}
    )
    message = write(fake_tools, ctx, scored, {"fixes": [a_fix()]})["message"]
    assert "- de-DE L1: Bis zu 30 % auf alle Jacken (still has: numbers)" in message


def test_tool_down_during_recheck(fake_tools, tmp_path):
    ctx = a_ctx(tmp_path)
    scored = a_scored_run(fake_tools, ctx, {("de-DE", "L1"): [NUMBERS]})
    fake_tools.respond("localization_check", error(500))
    out = write(fake_tools, ctx, scored, {"fixes": [a_fix()]})
    assert "(couldn't be re-checked)" in out["message"] and out["outcome"] == "fix_first"


def test_the_recheck_sends_only_the_fixed_lines(fake_tools, tmp_path):
    ctx = a_ctx(tmp_path)
    scored = a_scored_run(fake_tools, ctx, {("de-DE", "L1"): [NUMBERS]})
    recheck_answers(fake_tools, [fixed_line()])
    write(fake_tools, ctx, scored, {"fixes": [a_fix()]})
    sent = [params for name, params in fake_tools.calls if name == "localization_check"][-1]
    assert sent == {**a_package(lines=[fixed_line()]), "campaign": "Black Friday 2026"}


def test_a_recheck_report_of_the_wrong_shape_is_not_trusted(fake_tools, tmp_path):
    ctx = a_ctx(tmp_path)
    scored = a_scored_run(fake_tools, ctx, {("de-DE", "L1"): [NUMBERS]})
    report_ = a_tool_report(a_package(lines=[fixed_line()]))
    fake_tools.respond("localization_check", ok_body({**report_, "locales": [{"locale": "de-DE"}]}))
    assert (
        "(couldn't be re-checked)"
        in write(fake_tools, ctx, scored, {"fixes": [a_fix()]})["message"]
    )


def test_a_fix_that_still_has_a_warning_doesnt_pass(fake_tools, tmp_path):
    ctx = a_ctx(tmp_path)
    scored = a_scored_run(fake_tools, ctx, {("de-DE", "L1"): [NUMBERS]})
    recheck_answers(
        fake_tools, [fixed_line()], {("de-DE", "L1"): [a_finding("formality", "warning")]}
    )
    message = write(fake_tools, ctx, scored, {"fixes": [a_fix()]})["message"]
    assert "- de-DE L1: Bis zu 30 % auf alle Jacken (still has: formality)" in message
