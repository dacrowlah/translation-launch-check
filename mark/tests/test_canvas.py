from _canvas import cell, render
from _run_folder import read_verified, run_root
from report_support import by_webhook
from step_builders import a_ctx, a_finding, a_package, a_review, a_rule_check, a_tool_report

UNSURE = a_finding("currency_code", "warning", "unsure", detail="Is CHF 30 the same price?")
NUMBERS = a_finding("numbers", expected="30%", found="20 %", detail="The number differs.")
FIX = {"locale": "de-DE", "line_id": "L2", "text": "Hallo | {{first_name}}", "kind": "agent"}
FIX.update(note="", status="still_has", checks=["merge_tags"])
HEAD = (
    "# Translation Launch Check - Black Friday 2026\n\n"
    "Overall: No issues found by automated checks.\n\nRun: 2026-11-12 09:30 UTC\n\n"
)
CLOSING = (
    "\n\nA language passes only when every check ran and nothing blocks it.\n\n"
    "Checked against market rules v1.0 (effective 2026-11-13).\n\n"
    "Screening aid, not linguistic or legal sign-off."
)
FINDINGS_HEAD = (
    "## de-DE: Fix first\n\n### Findings\n"
    "| Line | Source | Check | Severity | Detail | Expected | Found | Reviewer |\n"
    "|---|---|---|---|---|---|---|---|\n"
)
FINDING_ROW = (
    "| L1 | rules | numbers | blocker | The number differs. | 30% | 20 % "
    "| likely a real problem - The price changed. |"
)
HUMAN = (
    "### Needs a human look\n- **L1** (currency\\_code): Is CHF 30 the same price?\n"
    "  - Master: Up to 30% off jackets\n  - Translation: Bis zu 30 % auf Jacken\n"
    "  - Back-translation: \\[L1\\] Up to 30% off jackets\n"
    "  - Reviewer's opinion: likely a real problem - The price changed.\n\n### Findings"
)
LINE_ROW = (
    "| L2 | email/body | Hi {{first\\_name}} | Hallo {{first\\_name}} | 20 chars "
    "| Hallo \\| {{first\\_name}} | still has: merge\\_tags |"
)


def scores_for(fake_tools, tmp_path, findings):
    ctx = a_ctx(tmp_path)

    def review(item):
        return a_review(
            item, rule_checks=[a_rule_check("R1", "real_problem", "The price changed.")]
        )

    scored = by_webhook(fake_tools, ctx, a_tool_report(a_package(), findings), review)
    return read_verified(
        scored["run_key"], "scores.json", scored["verdict_checksum"], root=run_root(ctx)
    )["data"]


def test_cell_escapes_table_breakers():
    assert cell("a|b\nc`d") == "a\\|b / c\\`d" and cell(None) == ""


def test_the_canvas_has_a_title_the_overall_verdict_and_the_closing_lines(fake_tools, tmp_path):
    text = render(scores_for(fake_tools, tmp_path, {}), [], "2026-11-12 09:30 UTC")
    assert text.startswith(HEAD) and text.endswith(CLOSING)


def test_a_language_section_lists_findings_with_the_reviewers_opinion(fake_tools, tmp_path):
    text = render(scores_for(fake_tools, tmp_path, {("de-DE", "L1"): [NUMBERS]}), [], "t")
    assert FINDINGS_HEAD in text and FINDING_ROW in text


def test_needs_a_human_look_comes_first_with_the_back_translation(fake_tools, tmp_path):
    text = render(scores_for(fake_tools, tmp_path, {("de-DE", "L1"): [UNSURE]}), [], "t")
    assert HUMAN in text


def test_lines_show_the_fix_and_its_recheck_and_copy_cant_break_the_table(fake_tools, tmp_path):
    text = render(scores_for(fake_tools, tmp_path, {}), [FIX], "t")
    assert LINE_ROW in text and "### Back-translation\n> \\[L1\\] Up to 30% off jackets" in text
