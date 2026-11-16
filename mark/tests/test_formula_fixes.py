"""A suggested fix that would start a spreadsheet formula in the corrected file gets its own
status and is never applied, unless the cell it replaces already starts with the same
character: German copy may start with "-30 %"."""

import pytest

from _fix_notes import starts_a_formula
from builders import FILE_LINK
from report_support import calls_to, write
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

FORMULA = '=HYPERLINK("https://evil.example","Jacken")'
MASTER = "Up to 30% off jackets"
PLAIN = "Bis zu 30 % auf Jacken"
FLAGGED = {("de-DE", "L1"): [a_finding("formality", "warning")]}
TWO_FLAGGED = {**FLAGGED, ("de-DE", "L2"): [a_finding("formality", "warning")]}
UNFIT = "starts like a spreadsheet formula - needs a person"
NOT_WRITTEN = ("Corrected file (", "The corrected file couldn't be saved")


@pytest.mark.parametrize("first", ["=", "+", "-", "@", "\t", "\r"])
def test_a_fix_starting_a_formula_the_cell_did_not_start_is_unfit(first):
    assert starts_a_formula(f"{first}30 % auf Jacken", PLAIN) is True


# Leading whitespace (a space, an ideographic space, a line break) or an invisible character
# (a BOM, a zero-width space) before the formula character hides nothing.
@pytest.mark.parametrize("lead", [" ", "\u3000", "\n", "\ufeff", "\u200b"])
def test_a_formula_after_leading_whitespace_or_an_invisible_character_is_unfit(lead):
    assert starts_a_formula(f"{lead}=1+1", PLAIN) is True


def test_a_fix_dropping_the_space_before_the_cells_minus_is_unfit():
    """The space kept " -20 %" from being read as a formula or number; "-30 %" would be."""
    assert starts_a_formula("-30 % auf Jacken", " -20 % auf Jacken") is True


@pytest.mark.parametrize("text", ["-30 % auf Jacken", PLAIN, "30 % - heute", " -30 %"])
def test_a_fix_keeping_the_cells_first_character_or_starting_plainly_is_fit(text):
    assert starts_a_formula(text, "-20 % auf Jacken") is False


def a_fixed_run(fake_tools, ctx, old, text):
    """L1 reads `old` and is flagged; its fix `text` passes the re-check."""
    pkg = a_package(lines=[a_line("L1", **{"en-US": MASTER, "de-DE": old})])
    scored = a_scored_run(fake_tools, ctx, FLAGGED, pkg)
    fixed = a_package(lines=[a_line("L1", **{"en-US": MASTER, "de-DE": text})])
    fake_tools.respond("localization_check", ok_body(a_tool_report(fixed)))
    return write(fake_tools, ctx, scored, {"fixes": [a_fix(text=text)]})


def test_a_formula_fix_is_marked_and_not_written_into_the_corrected_file(
    fake_tools, tmp_path, capsys
):
    message = a_fixed_run(fake_tools, a_ctx(tmp_path), PLAIN, FORMULA)["message"]
    assert f"({UNFIT})" in message
    assert [text for text in NOT_WRITTEN if text in message] == []
    assert "write_content_to_file" not in [name for name, _ in fake_tools.calls]
    assert capsys.readouterr() == ("", "")


def test_a_fix_keeping_a_leading_minus_is_applied(fake_tools, tmp_path):
    text = "-30 % auf alle Jacken"
    out = a_fixed_run(fake_tools, a_ctx(tmp_path), "-20 % auf Jacken", text)
    assert f"- de-DE L1: {text} (passes the rule checks)" in out["message"]
    rows = calls_to(fake_tools, "write_content_to_file")[0]["content"].splitlines()
    assert rows[1] == f"L1,email,subject,{MASTER},{text}"


def test_a_mixed_run_marks_the_formula_in_the_canvas_and_counts_only_the_real_fix(
    fake_tools, tmp_path
):
    ctx, greeting = a_ctx(tmp_path), "Hallo {{first_name}}!"
    scored = a_scored_run(fake_tools, ctx, TWO_FLAGGED)
    lines = [a_line("L1", **{"en-US": MASTER, "de-DE": FORMULA})]
    lines += [a_line("L2", "email", "body", **{"en-US": "Hi {{first_name}}", "de-DE": greeting})]
    fake_tools.respond("localization_check", ok_body(a_tool_report(a_package(lines=lines))))
    fixes = {"fixes": [a_fix(text=FORMULA), a_fix(line_id="L2", text=greeting)]}
    message = write(fake_tools, ctx, scored, fixes)["message"]
    assert UNFIT in calls_to(fake_tools, "create_canvas")[0]["content"]
    applied = f"Corrected file (1 fix applied, re-checked): [Download]({FILE_LINK})"
    assert f"{applied}\n1 line still needs a person." in message
