"""The QA-inbox email is plain text: the same wording as the chat reply, with no Markdown
escapes and links written as "Label: url" on their own line. The chat reply keeps Markdown."""

from builders import FILE_LINK
from report_support import CANVAS_URL, write
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

GREETING = "Hallo {{first_name}}, willkommen"
FORMALITY = {("de-DE", "L2"): [a_finding("formality", "warning")]}


def fixed_greeting(fake_tools, ctx):
    """A webhook run whose de-DE L2 has a warning and a fix that passes the re-check."""
    scored = a_scored_run(fake_tools, ctx, FORMALITY)
    fixed = a_line("L2", "email", "body", **{"en-US": "Hi {{first_name}}", "de-DE": GREETING})
    fake_tools.respond("localization_check", ok_body(a_tool_report(a_package(lines=[fixed]))))
    out = write(fake_tools, ctx, scored, {"fixes": [a_fix(line_id="L2", text=GREETING)]})
    body = next(params["body"] for name, params in fake_tools.calls if name == "send_email")
    return out, body


PLAIN_EMAIL = (
    "Overall: No blocking issues found by automated checks. Review the warnings below.\n\n"
    "- de-DE: No blocking issues found by automated checks (1 warning)\n\n"
    "Top fixes:\n"
    "- de-DE L2: Hallo {{first_name}}, willkommen (passes the rule checks)\n"
    f"Corrected file (1 fix applied, re-checked): {FILE_LINK}\n\n"
    f"Detailed report: {CANVAS_URL}\n\n"
    "A language passes only when every check ran and nothing blocks it.\n\n"
    "Checked against market rules v1.0 (effective 2026-11-13).\n\n"
    "Screening aid, not linguistic or legal sign-off."
)


def test_the_email_is_plain_text(fake_tools, tmp_path):
    assert fixed_greeting(fake_tools, a_ctx(tmp_path))[1] == PLAIN_EMAIL


def test_the_chat_reply_keeps_markdown(fake_tools, tmp_path):
    message = fixed_greeting(fake_tools, a_ctx(tmp_path))[0]["message"]
    assert "- de-DE L2: Hallo {{first\\_name}}, willkommen (passes the rule checks)" in message
    assert f"Corrected file (1 fix applied, re-checked): [Download]({FILE_LINK})" in message
    assert "Detailed report: [Translation Launch Check - Black Friday 2026 - " in message
