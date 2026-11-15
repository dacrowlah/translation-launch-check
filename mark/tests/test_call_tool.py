import pytest
from opal_tms_sdk import ToolInvocationError, ToolUnavailableError

from _shared import call_tool
from builders import error, json_error, ok, tool_body

UNAVAILABLE = {"ok": False, "status": "unavailable", "body": None}


def test_returns_the_body_when_the_tool_says_ok(fake_tools):
    fake_tools.respond("localization_check", ok(tool_body(report={"a": 1})))
    assert call_tool("localization_check") == {
        "ok": True,
        "status": "ok",
        "body": {"status": "ok", "report": {"a": 1}},
    }


def test_records_one_call_with_its_params(fake_tools):
    fake_tools.respond("localization_check", ok(tool_body()))
    call_tool("localization_check", texts=["a"], locales=["de-DE"])
    assert fake_tools.calls == [("localization_check", {"texts": ["a"], "locales": ["de-DE"]})]


def test_passes_tool_parameters_called_name_and_tool(fake_tools):
    fake_tools.respond("localization_check", ok(tool_body()))
    call_tool("localization_check", name="Report", tool="x")
    assert fake_tools.calls == [("localization_check", {"name": "Report", "tool": "x"})]


@pytest.mark.parametrize("token", ["invalid_input", "internal_error", "invalid_request"])
def test_returns_our_tools_failure_token_without_the_body(fake_tools, token):
    fake_tools.respond("localization_check", ok(tool_body(token, issues=["detail"])))
    assert call_tool("localization_check") == {"ok": False, "status": token, "body": None}


@pytest.mark.parametrize(
    "result",
    [
        error(500),
        {"response_type": "error", "response": tool_body()},
        None,
        "Internal Server Error",
        [ok(tool_body())],
        {"response_type": "application/json"},
        ok("Internal Server Error"),
        ok(None),
        ok({"error": "invalid_input"}),
        ok({"a": 1}),
        json_error(500),
        ok(tool_body(status_code=500)),
        ok(tool_body(status_code=400)),
        ok(tool_body(status_code="500")),
        ok(tool_body(status_code=" 503 ")),
        ok(tool_body(status_code=500.0)),
        ok(tool_body("OK")),
        ok(tool_body("not_found")),
        ok(tool_body(["ok"])),
        ok(tool_body(None)),
    ],
)
def test_every_other_shape_is_unavailable(fake_tools, result):
    fake_tools.respond("localization_check", result)
    assert call_tool("localization_check") == UNAVAILABLE


@pytest.mark.parametrize("code", [True, 200, 399, 399.5, "200", "n/a", None])
def test_a_status_code_below_400_or_not_a_number_is_no_failure(fake_tools, code):
    fake_tools.respond("localization_check", ok(tool_body(status_code=code)))
    assert call_tool("localization_check")["ok"] is True


def test_an_sdk_exception_is_unavailable(fake_tools):
    fake_tools.respond("localization_check", ToolUnavailableError("secret detail"))
    assert call_tool("localization_check") == UNAVAILABLE


@pytest.mark.parametrize("tool", ["_private", None, 7])
def test_a_tool_the_sdk_cannot_resolve_is_unavailable(fake_tools, tool):
    assert call_tool(tool) == UNAVAILABLE


def test_prints_nothing(fake_tools, capsys):
    fake_tools.respond("localization_check", ToolInvocationError("boom"))
    call_tool("localization_check")
    assert capsys.readouterr() == ("", "")


@pytest.mark.parametrize("exc", [SystemExit("scripted"), KeyboardInterrupt()])
def test_a_base_exception_from_the_sdk_propagates(fake_tools, exc):
    fake_tools.respond("localization_check", exc)
    with pytest.raises(type(exc)):
        call_tool("localization_check")
