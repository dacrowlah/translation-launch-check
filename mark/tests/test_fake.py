import pytest
from opal_tms_sdk import ToolUnavailableError, UnscriptedCall

from _shared import call_tool, run_safely
from builders import ok


def test_the_fake_returns_the_scripted_result(fake_tools):
    fake_tools.respond("localization_check", ok({"status": "ok"}))
    assert fake_tools.localization_check(texts=[]) == ok({"status": "ok"})


def test_the_fake_raises_a_scripted_exception(fake_tools):
    fake_tools.respond("localization_check", ToolUnavailableError("scripted"))
    with pytest.raises(ToolUnavailableError, match="scripted"):
        fake_tools.localization_check()


def test_an_unscripted_tool_fails_the_test_through_call_tool(fake_tools):
    fake_tools.respond("localization_check", ok({"status": "ok"}))
    with pytest.raises(UnscriptedCall, match="localisation_check"):
        call_tool("localisation_check")


def test_an_unscripted_tool_fails_the_test_through_run_safely(fake_tools):
    with pytest.raises(UnscriptedCall):
        run_safely(lambda i, c: call_tool("localization_check"), {}, {}, {"route": "x"})


def test_the_fake_refuses_an_exception_class(fake_tools):
    with pytest.raises(AssertionError, match="instance"):
        fake_tools.respond("localization_check", ToolUnavailableError)
