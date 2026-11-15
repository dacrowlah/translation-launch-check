import pytest
from opal_tms_sdk import ToolUnavailableError

import read_and_check
from _run_folder import read_verified, run_root
from builders import EXAMPLE_ALLOWED, EXAMPLE_WEBHOOK, error, json_error, ok, tool_body
from step_builders import (
    a_csv,
    a_ctx,
    a_package,
    a_payload,
    a_tool_report,
    a_webhook_input,
    attach,
    problems_of,
)

ATTACH_ONE = ["Attach exactly one localization CSV."]
TOOL_DOWN = [
    "Couldn't run the checks right now. Your file wasn't the problem; re-run in a few minutes."
]


def run(ctx, **input_):
    return read_and_check.handler(input_, ctx)


def tool_answers(fake_tools, pkg=None, findings=None):
    fake_tools.respond(
        "localization_check", ok(tool_body(**a_tool_report(pkg or a_package(), findings)))
    )


def check_file(out, ctx):
    root = run_root(ctx)
    return read_verified(out["run_key"], "check.json", out["check_checksum"], root=root)["data"]


def test_chat_csv_runs_the_tool_once_with_the_whole_package(fake_tools, tmp_path):
    tool_answers(fake_tools)
    run(attach(tmp_path, "Black Friday 2026.csv", a_csv()), trigger_name="Chat")
    assert fake_tools.calls == [("localization_check", a_package())]


def test_a_valid_chat_file_routes_to_check(fake_tools, tmp_path):
    tool_answers(fake_tools)
    out = run(attach(tmp_path, "Black Friday 2026.csv", a_csv()), trigger_name="Chat")
    assert {key: out[key] for key in ("route", "campaign", "source", "summary")} == {
        "route": "tlc_route_check",
        "campaign": "Black Friday 2026",
        "source": "chat",
        "summary": "Languages checked: 1.",
    }
    assert [sorted(item) for item in out["locales"]] == [
        ["back_translation_input", "checksum", "locale", "review_input"]
    ]


def test_chat_runs_never_get_notify_email(fake_tools, tmp_path):
    tool_answers(fake_tools)
    ctx = attach(tmp_path, "bf.csv", a_csv())
    assert check_file(run(ctx, trigger_name="Chat"), ctx)["notify_email"] is None


@pytest.mark.parametrize(
    "result",
    [error(500), json_error(500), ok(tool_body("invalid_input")), ToolUnavailableError("x")],
)
def test_tool_failure_is_not_the_users_fault(fake_tools, tmp_path, result):
    fake_tools.respond("localization_check", result)
    out = run(attach(tmp_path, "bf.csv", a_csv()), trigger_name="Chat")
    assert out["route"] == "tlc_route_needs_info" and problems_of(out["problems"]) == TOOL_DOWN


def wrong_shapes():
    """Tool reports that don't fit a one-locale (de-DE) package."""
    report = a_tool_report(a_package())
    return [
        a_tool_report(a_package(locales=("fr-FR",))),
        a_tool_report(a_package(locales=("de-DE", "fr-FR"))),
        {**report, "master": None},
        {**report, "rules": {"version": "1.0"}},
        {**report, "locales": [{**report["locales"][0], "status": "skipped"}]},
        {**report, "locales": [{**report["locales"][0], "checks": None}]},
    ]


@pytest.mark.parametrize("report", wrong_shapes())
def test_a_tool_report_of_the_wrong_shape_is_the_tool_failing(fake_tools, tmp_path, report):
    fake_tools.respond("localization_check", ok(tool_body(**report)))
    assert problems_of(run(attach(tmp_path, "bf.csv", a_csv()))["problems"]) == TOOL_DOWN


def test_no_attachment_and_no_webhook(fake_tools, tmp_path):
    assert problems_of(run(a_ctx(tmp_path), trigger_name="Chat")["problems"]) == ATTACH_ONE
    assert fake_tools.calls == []


@pytest.mark.parametrize("names", [["a.csv", "b.csv"], ["bf.xlsx"]])
def test_two_attachments_or_not_a_csv(fake_tools, tmp_path, names):
    for name in names:
        ctx = attach(tmp_path, name, a_csv())
    assert problems_of(run(ctx, trigger_name="Chat")["problems"]) == ATTACH_ONE


def test_text_content_is_never_read(fake_tools, tmp_path):
    out = run(a_ctx(tmp_path), trigger_name="Chat", text_content=a_csv().decode("utf-8"))
    assert problems_of(out["problems"]) == ATTACH_ONE


def test_a_chat_run_ignores_a_webhook_payload(fake_tools, tmp_path):
    out = run(a_ctx(tmp_path), trigger_name="Chat", webhook_payload=a_payload(a_package()))
    assert problems_of(out["problems"]) == ATTACH_ONE and fake_tools.calls == []


def test_email_runs_are_not_supported_yet(fake_tools, tmp_path):
    out = run(a_ctx(tmp_path), trigger_name="Email", webhook_payload=a_payload(a_package()))
    assert problems_of(out["problems"]) == ["Email can't carry the file yet."]


def test_webhook_valid_package_checks_and_reports_to_the_qa_inbox(fake_tools, tmp_path):
    tool_answers(fake_tools)
    ctx = a_ctx(tmp_path)
    out = run(ctx, **a_webhook_input(a_package()))
    assert out["source"] == "webhook" and check_file(out, ctx)["notify_email"] == EXAMPLE_ALLOWED


def test_webhook_checksum_mismatch_rejects(fake_tools, tmp_path):
    payload = {**a_payload(a_package()), "campaign": "Changed"}
    out = run(a_ctx(tmp_path), trigger_name=EXAMPLE_WEBHOOK, webhook_payload=payload)
    assert (
        problems_of(out["problems"]) == ["The package changed in transit."]
        and out["campaign"] == "Changed"
    )


def test_csv_problems_route_to_needs_info_with_the_campaign(fake_tools, tmp_path):
    out = run(attach(tmp_path, "Sale.csv", a_csv(rows=[["L1", "email", "subject", "Hi", ""]])))
    assert out == {
        "route": "tlc_route_needs_info",
        "problems": [
            {
                "where": "row 2",
                "message": "L1 has no de-DE text.",
                "suggestion": "Fill in every cell, or delete the row.",
            }
        ],
        "campaign": "Sale",
        "summary": "The file needs changes; problems found: 1.",
    }


def test_problems_are_capped_and_the_rest_counted(fake_tools, tmp_path):
    rows = [[f"L{n}", "email", "subject", "Hi", ""] for n in range(30)]
    problems = run(attach(tmp_path, "bf.csv", a_csv(rows=rows)))["problems"]
    assert len(problems) == 26 and problems[-1]["message"] == "...and 5 more problems."


def test_a_run_folder_failure_is_our_side(fake_tools, tmp_path):
    tool_answers(fake_tools)
    ctx = attach(tmp_path, "bf.csv", a_csv())
    (tmp_path / "blocked").write_text("a file, not a folder")
    out = run({**ctx, "run_root": str(tmp_path / "blocked")})
    assert problems_of(out["problems"]) == [
        "Something went wrong on our side. Please re-run the check."
    ]


def test_prints_nothing(fake_tools, tmp_path, capsys):
    tool_answers(fake_tools)
    run(attach(tmp_path, "bf.csv", a_csv()), trigger_name="Chat")
    run(a_ctx(tmp_path / "empty"))
    assert capsys.readouterr() == ("", "")
