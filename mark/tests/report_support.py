"""Shared helpers for the report step's tests: a fixed clock, a scripted platform and a
scored run (the real Read and check, Save the review and Score steps, sent by webhook)."""

from datetime import UTC, datetime

import read_and_check
import report
import score
from builders import a_written_file, ok
from step_builders import (
    a_package,
    a_review,
    a_tool_report,
    a_webhook_input,
    ok_body,
    save,
)

CANVAS_URL = "https://canvas.example.test/c/1"


def fixed_now():
    return datetime(2026, 11, 12, 9, 30, tzinfo=UTC)


def write(fake_tools, ctx, scored, fixes=None):
    return delivered_with(fake_tools, ctx, {**scored, "fixes": fixes}, a_written_file())


def delivered_with(fake_tools, ctx, report_input, written):
    """The report step's answer, with `written` as write_content_to_file's result."""
    fake_tools.respond("create_canvas", ok({"artifact_url": CANVAS_URL}))
    fake_tools.respond("send_email", ok({"status": "sent"}))
    fake_tools.respond("write_content_to_file", written)
    return report.impl(report_input, ctx, fixed_now)


def names(fake_tools):
    return [call[0] for call in fake_tools.calls]


def scored_after(fake_tools, ctx, checked, review=None):
    item = checked["locales"][0]
    save(ctx, checked, item, review=review(item) if review else a_review(item))
    out = score.handler(
        {"run_key": checked["run_key"], "check_checksum": checked["check_checksum"]}, ctx
    )
    return {"run_key": out["run_key"], "verdict_checksum": out["verdict_checksum"]}


def by_webhook(fake_tools, ctx, report_=None, review=None):
    fake_tools.respond("localization_check", ok_body(report_ or a_tool_report(a_package())))
    checked = read_and_check.handler(a_webhook_input(a_package()), ctx)
    return scored_after(fake_tools, ctx, checked, review)
