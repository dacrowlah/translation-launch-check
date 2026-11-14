from _shared import call_tool, facts_checksum, run_safely
from builders import error, json_error, ok


def test_call_tool_error_shape(fake_tools):
    fake_tools.respond("x", error(500))
    assert call_tool("x") == {"ok": False, "body": None}


def test_call_tool_json_500_shape(fake_tools):
    fake_tools.respond("x", json_error(500))
    assert call_tool("x")["ok"] is False


def test_call_tool_non_dict_result(fake_tools):
    fake_tools.respond("x", None)
    assert call_tool("x") == {"ok": False, "body": None}


def test_call_tool_success(fake_tools):
    fake_tools.respond("x", ok({"a": 1}))
    assert call_tool("x") == {"ok": True, "body": {"a": 1}}


def test_call_tool_records_name_and_params(fake_tools):
    fake_tools.respond("x", ok({}))
    call_tool("x", texts=["a"])
    assert fake_tools.calls == [("x", {"texts": ["a"]})]


def test_run_safely_hides_exceptions(capsys):
    out = run_safely(lambda i, c: 1 / 0, {}, {})
    assert out["route"] == "needs_info" and "ZeroDivision" not in str(out)
    assert out["problems"][0]["message"].startswith("Something went wrong")
    assert capsys.readouterr() == ("", "")


def test_run_safely_uses_the_given_fallback():
    assert run_safely(lambda i, c: 1 / 0, {}, {}, {"route": "x"}) == {"route": "x"}


def test_run_safely_passes_results_through():
    assert run_safely(lambda i, c: {"a": i, "b": c}, 1, 2) == {"a": 1, "b": 2}


def test_checksum_ignores_key_order():
    assert facts_checksum({"a": 1, "b": [1]}) == facts_checksum({"b": [1], "a": 1})
    assert facts_checksum({"t": "\u00e9"}) == "5a4e86c58f34a06c"
