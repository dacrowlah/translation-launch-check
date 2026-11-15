import pytest

import read_and_check
from _budgets import FIX_BOUNDS
from _fix_input import expected_fix_bytes, within_cap
from step_builders import (
    a_checked_run,
    a_ctx,
    a_finding,
    a_package,
    a_review,
    a_review_finding,
    a_rule_check,
    a_tool_report,
    a_webhook_input,
    ok_body,
    save,
    scored,
)

NUMBERS = a_finding("numbers", expected="30%", found="20 %", detail="The number differs.")
SPELLING = a_finding("locale_spelling", "warning", detail="Use UK spelling.")
UNSURE = a_finding("numbers", "warning", "unsure", detail="Is 30 % the same number?")


def run(fake_tools, tmp_path, findings, review=None):
    ctx = a_ctx(tmp_path)
    checked = a_checked_run(fake_tools, ctx, findings)
    item = checked["locales"][0]
    save(ctx, checked, item, review=review(item) if review else a_review(item))
    return scored(ctx, checked)


def to_fix(scores):
    return [(entry["locale"], entry["line_id"]) for entry in scores["lines_to_fix"]]


def with_spelling_fix(fake_tools, tmp_path, findings):
    """Score a de-DE run whose L1 has a code-made spelling fix."""
    report = a_tool_report(a_package(), findings)
    report["locales"][0]["lines"][0]["spelling_fix"] = "Bis zu 30 % auf Jacken!"
    fake_tools.respond("localization_check", ok_body(report))
    ctx = a_ctx(tmp_path)
    checked = read_and_check.handler(a_webhook_input(a_package()), ctx)
    save(ctx, checked, checked["locales"][0])
    return scored(ctx, checked)


def test_routes_fix_only_when_something_to_fix(fake_tools, tmp_path):
    out, scores = run(
        fake_tools, tmp_path / "a", {("de-DE", "L2"): [a_finding("formality", "warning")]}
    )
    assert out["route"] == "tlc_route_fix" and to_fix(scores) == [("de-DE", "L2")]
    out, scores = run(
        fake_tools, tmp_path / "b", {("de-DE", "L2"): [a_finding("typography", "info")]}
    )
    assert out["route"] == "tlc_route_report" and to_fix(scores) == []


def test_column_findings_are_not_lines_to_fix(fake_tools, tmp_path):
    out, _ = run(fake_tools, tmp_path, {("de-DE", None): [a_finding("language_column")]})
    assert (out["route"], out["outcome"]) == ("tlc_route_report", "fix_first")


def test_review_findings_go_to_the_fixer(fake_tools, tmp_path):
    def review(item):
        return a_review(item, [a_review_finding("L2", "claim", "blocker")])

    assert to_fix(run(fake_tools, tmp_path, {}, review)[1]) == [("de-DE", "L2")]


def test_spelling_only_line_is_fixed_by_code_not_the_agent(fake_tools, tmp_path):
    out, scores = with_spelling_fix(fake_tools, tmp_path, {("de-DE", "L1"): [SPELLING]})
    assert out["route"] == "tlc_route_report" and to_fix(scores) == []


def test_a_line_with_spelling_and_more_starts_from_the_spelling_fix(fake_tools, tmp_path):
    _, scores = with_spelling_fix(fake_tools, tmp_path, {("de-DE", "L1"): [SPELLING, NUMBERS]})
    assert (
        to_fix(scores) == [("de-DE", "L1")]
        and scores["lines_to_fix"][0]["start_text"] == "Bis zu 30 % auf Jacken!"
    )


@pytest.mark.parametrize(
    ("opinion", "expected"),
    [("real_problem", [("de-DE", "L1")]), ("same_meaning", []), ("cannot_tell", []), (None, [])],
)
def test_an_unsure_finding_goes_to_the_fixer_only_when_a_real_problem(
    fake_tools, tmp_path, opinion, expected
):
    def review(item):
        return a_review(item, rule_checks=[a_rule_check("R1", opinion)] if opinion else [])

    assert to_fix(run(fake_tools, tmp_path, {("de-DE", "L1"): [UNSURE]}, review)[1]) == expected


def test_a_certain_value_blocker_goes_to_the_fixer_whatever_the_opinion(fake_tools, tmp_path):
    def review(item):
        return a_review(item, rule_checks=[a_rule_check("R1", "same_meaning")])

    assert to_fix(run(fake_tools, tmp_path, {("de-DE", "L1"): [NUMBERS]}, review)[1]) == [
        ("de-DE", "L1")
    ]


def test_fix_input_lists_each_line_with_its_problems(fake_tools, tmp_path):
    out, _ = run(
        fake_tools, tmp_path, {("de-DE", "L1"): [NUMBERS, a_finding("typography", "info")]}
    )
    assert out["fix_input"] == (
        "[de-DE L1] email/subject\n"
        "Master: Up to 30% off jackets\n"
        "Translation: Bis zu 30 % auf Jacken\n"
        "Length: 22 chars\n"
        "Problems:\n"
        "- numbers (blocker): The number differs. Expected: 30%. Found: 20 %."
    )


CURRENCY = a_finding(
    "currency_code",
    "warning",
    detail="The currency differs from the master; confirm the local price.",
    expected="$",
    found="CHF",
)
PRICE = a_finding("currency_amount", detail="A price differs.", expected="49.90", found="59.90")


def test_a_line_with_only_price_or_currency_problems_is_not_sent(fake_tools, tmp_path):
    out, scores = run(fake_tools, tmp_path, {("de-DE", "L1"): [CURRENCY, PRICE]})
    assert to_fix(scores) == [] and out["fix_input"] == ""


def test_price_and_currency_problems_go_to_a_person_without_values(fake_tools, tmp_path):
    out, _ = run(fake_tools, tmp_path, {("de-DE", "L1"): [CURRENCY, NUMBERS]})
    assert out["fix_input"].endswith(
        "Problems:\n- numbers (blocker): The number differs. Expected: 30%. Found: 20 %.\n"
        "For a person (keep prices and currencies as written):\n"
        "- currency_code (warning): The currency differs from the master; confirm the local price."
    )


def an_entry(master_size):
    names = {"locale": "de-DE", "line_id": "L1", "channel": "email", "field": "body"}
    texts = {"master": "x" * master_size, "text": "y", "start_text": "y"}
    return {**names, **texts, "length": None, "findings": []}


def test_fix_input_is_capped_at_the_leading_lines_that_fit():
    entries = [an_entry(20_000), an_entry(20_000), an_entry(20_000), an_entry(10)]
    assert within_cap(entries) == entries[:2]


def test_the_fixer_gets_no_more_lines_than_its_schema_admits():
    # 63 short lines fit both byte caps; the schema admits 60 fixes
    entries = [an_entry(10) for _ in range(FIX_BOUNDS["fixes"] + 3)]
    assert within_cap(entries) == entries[: FIX_BOUNDS["fixes"]]


def test_a_lines_expected_fix_grows_a_fifth_but_never_past_the_schema_bound():
    # a 100-character start: a 121-character draft (123 as JSON) plus note, id and keys (400)
    assert expected_fix_bytes({"start_text": "x" * 100}) == 523
    # a 1,000-character start: the draft stops at suggested_text's bound of 1,000 characters
    assert expected_fix_bytes({"start_text": "x" * 1000}) == 1402
