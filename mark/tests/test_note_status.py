"""A fix that reads as a note gets its own status upstream, so the chat reply, the canvas,
the corrected file and its "N fixes applied" count all agree: it never "passes"."""

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

DNT = a_finding(
    "glossary_dnt",
    "warning",
    detail="A do-not-translate term is missing or was translated.",
    expected="TrailPro",
)
FLAGGED = {("de-DE", "L1"): [DNT], ("de-DE", "L2"): [a_finding("formality", "warning")]}
NOTE = "Bis zu 30 % auf Jacken (statt Trail-Pro-Jacken) TrailPro"
GREETING = "Hallo {{first_name}}!"


def a_note_and_a_fix(fake_tools, ctx):
    """L1's fix is a note, L2's a real fix; both pass the re-check."""
    scored = a_scored_run(fake_tools, ctx, FLAGGED)
    lines = [a_line("L1", **{"en-US": "Up to 30% off jackets", "de-DE": NOTE})]
    lines += [a_line("L2", "email", "body", **{"en-US": "Hi {{first_name}}", "de-DE": GREETING})]
    fake_tools.respond("localization_check", ok_body(a_tool_report(a_package(lines=lines))))
    fixes = {"fixes": [a_fix(text=NOTE), a_fix(line_id="L2", text=GREETING)]}
    return write(fake_tools, ctx, scored, fixes)


def test_the_chat_reply_marks_the_note(fake_tools, tmp_path):
    message = a_note_and_a_fix(fake_tools, a_ctx(tmp_path))["message"]
    line = "- de-DE L1: Bis zu 30 % auf Jacken \\(statt Trail-Pro-Jacken\\) TrailPro"
    assert f"{line} (reads as a note, not copy - needs a person)" in message


def test_the_canvas_marks_the_note(fake_tools, tmp_path):
    a_note_and_a_fix(fake_tools, a_ctx(tmp_path))
    assert (
        "reads as a note, not copy - needs a person"
        in calls_to(fake_tools, "create_canvas")[0]["content"]
    )


def test_the_corrected_file_counts_only_the_real_fix(fake_tools, tmp_path):
    message = a_note_and_a_fix(fake_tools, a_ctx(tmp_path))["message"]
    applied = f"Corrected file (1 fix applied, re-checked): [Download]({FILE_LINK})"
    assert f"{applied}\n1 line still needs a person." in message


def test_the_note_is_not_written_into_the_corrected_file(fake_tools, tmp_path):
    a_note_and_a_fix(fake_tools, a_ctx(tmp_path))
    rows = calls_to(fake_tools, "write_content_to_file")[0]["content"].splitlines()
    assert rows[1:3] == [
        "L1,email,subject,Up to 30% off jackets,Bis zu 30 % auf Jacken",
        "L2,email,body,Hi {{first_name}},Hallo {{first_name}}!",
    ]


def test_a_note_that_still_fails_the_recheck_keeps_that_status(fake_tools, tmp_path):
    ctx = a_ctx(tmp_path)
    scored = a_scored_run(fake_tools, ctx, FLAGGED)
    pkg = a_package(lines=[a_line("L1", **{"en-US": "Up to 30% off jackets", "de-DE": NOTE})])
    still = a_tool_report(pkg, {("de-DE", "L1"): [a_finding("numbers")]})
    fake_tools.respond("localization_check", ok_body(still))
    message = write(fake_tools, ctx, scored, {"fixes": [a_fix(text=NOTE)]})["message"]
    assert "TrailPro (still has: numbers)" in message


def test_a_term_fix_of_the_right_size_passes(fake_tools, tmp_path):
    ctx = a_ctx(tmp_path)
    scored = a_scored_run(fake_tools, ctx, {("de-DE", "L1"): [DNT]})
    fixed = "Bis zu 30 % auf TrailPro-Jacken"  # the name and one separator: 9 more characters
    pkg = a_package(lines=[a_line("L1", **{"en-US": "Up to 30% off jackets", "de-DE": fixed})])
    fake_tools.respond("localization_check", ok_body(a_tool_report(pkg)))
    message = write(fake_tools, ctx, scored, {"fixes": [a_fix(text=fixed)]})["message"]
    assert f"- de-DE L1: {fixed} (passes the rule checks)" in message
