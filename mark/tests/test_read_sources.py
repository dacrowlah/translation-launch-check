import json

import pytest

import read_and_check
from _config import PRIVATE
from builders import EXAMPLE_WEBHOOK, error, ok, tool_body
from step_builders import (
    HEADER,
    a_csv,
    a_ctx,
    a_package,
    a_payload,
    a_tool_report,
    attach,
    problems_of,
)

ATTACH_ONE = ["Attach exactly one localization CSV."]


def run(ctx, **input_):
    return read_and_check.handler(input_, ctx)


@pytest.mark.parametrize(
    "trigger", [None, "", "Webhook", "chat", "Manual", EXAMPLE_WEBHOOK.lower()]
)
def test_only_the_configured_webhook_trigger_counts_as_a_webhook(fake_tools, tmp_path, trigger):
    out = run(a_ctx(tmp_path), trigger_name=trigger, webhook_payload=a_payload(a_package()))
    assert problems_of(out["problems"]) == ATTACH_ONE and fake_tools.calls == []


def test_without_a_configured_name_no_run_is_a_webhook(fake_tools, tmp_path, monkeypatch):
    monkeypatch.setitem(PRIVATE, "webhook_trigger_name", None)
    out = run(a_ctx(tmp_path), trigger_name=None, webhook_payload=a_payload(a_package()))
    assert problems_of(out["problems"]) == ATTACH_ONE


def test_a_webhook_payload_as_json_text_is_read(fake_tools, tmp_path):
    fake_tools.respond("localization_check", ok(tool_body(**a_tool_report(a_package()))))
    text = json.dumps(a_payload(a_package()))
    out = run(a_ctx(tmp_path), trigger_name=EXAMPLE_WEBHOOK, webhook_payload=text)
    assert (out["route"], out["source"]) == ("tlc_route_check", "webhook")


def without_route(out):
    return json.dumps({key: value for key, value in out.items() if key != "route"})


ROUTE_ECHOES = [
    (
        "bf.csv",
        a_csv(
            header=[*HEADER, "tlc_route_check"],
            rows=[["L1", "email", "subject", "Hi", "Hallo", "x"]],
        ),
    ),
    ("bf.csv", a_csv(rows=[["tlc_route_fix", "email", "subject", "Hi", "Hallo"]] * 2)),
    ("tlc_route_check.csv", a_csv()),
]


@pytest.mark.parametrize(("name", "raw"), ROUTE_ECHOES, ids=["column", "duplicate_id", "file_name"])
def test_no_user_text_can_put_a_route_token_into_the_output(fake_tools, tmp_path, name, raw):
    out = run(attach(tmp_path, name, raw), trigger_name="Chat")
    assert out["route"] == "tlc_route_needs_info" and "tlc_route_" not in without_route(out).lower()


def test_a_tool_failure_is_summarised_as_our_side(fake_tools, tmp_path):
    fake_tools.respond("localization_check", error(500))
    out = run(attach(tmp_path, "bf.csv", a_csv()), trigger_name="Chat")
    assert out["summary"] == "The checks couldn't run."
