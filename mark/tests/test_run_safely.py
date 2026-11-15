import sys

import pytest

from _shared import run_safely
from _text import TEXT


def _boom(input_, ctx):
    raise ZeroDivisionError("secret detail /srv/app.py")


def test_passes_results_through():
    assert run_safely(lambda i, c: {"a": i, "b": c}, 1, 2) == {"a": 1, "b": 2}


def test_returns_the_given_fallback():
    assert run_safely(_boom, {}, {}, {"route": "x"}) == {"route": "x"}


def test_default_fallback_asks_for_a_re_run():
    assert run_safely(_boom, {}, {}) == {
        "route": "tlc_route_needs_info",
        "problems": [
            {
                "where": "",
                "message": "Something went wrong on our side. Please re-run the check.",
                "suggestion": "",
            }
        ],
        "summary": "internal error",
    }


def test_default_fallback_takes_its_text_from_the_templates():
    out = run_safely(_boom, {}, {})
    assert out["summary"] == TEXT["internal_error_summary"]
    assert out["problems"][0]["message"] == TEXT["internal_error"]


def test_default_fallback_is_fresh_each_time():
    first = run_safely(_boom, {}, {})
    first["problems"].append("changed")
    assert len(run_safely(_boom, {}, {})["problems"]) == 1


def test_prints_nothing_and_hides_the_exception(capsys):
    out = run_safely(_boom, {}, {})
    assert "secret" not in str(out)
    assert "ZeroDivision" not in str(out)
    assert capsys.readouterr() == ("", "")


@pytest.mark.parametrize(
    "result",
    [
        {"x": {1, 2}},
        {"x": float("nan")},
        {"x": "a" * 249_992},
        {"x": "\u00fc" * 41_666},
        {"x": "\u6625" * 50_000},
        {"x": "\U0001f600" * 20_833},
        ["not", "a", "dict"],
        None,
        {1: "a"},
    ],
)
def test_falls_back_for_a_result_mark_cannot_return(result):
    assert run_safely(lambda i, c: result, {}, {}, {"route": "x"}) == {"route": "x"}


@pytest.mark.parametrize(
    "result",
    [
        {"x": "a" * 249_991},  # {"x": "..."} is 9 bytes plus the text
        {"x": "\u00fc" * 41_665},  # 9 + 6 x 41,665 = 249,999 bytes escaped
        {"x": "\u00fc" * 41_665 + "a"},  # 250,000
        {"x": "\U0001f600" * 20_832},  # 9 + 12 x 20,832 = 249,993
    ],
)
def test_returns_a_result_of_at_most_250000_escaped_bytes(result):
    assert run_safely(lambda i, c: result, {}, {}, {"route": "x"}) is result


def test_catches_system_exit_silently(capsys):
    out = run_safely(lambda i, c: sys.exit("detail /srv/app.py"), {}, {}, {"route": "x"})
    assert out == {"route": "x"}
    assert capsys.readouterr() == ("", "")
