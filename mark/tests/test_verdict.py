import json

import pytest

from _review import parse_review
from _verdict import overall, verdict_for
from step_builders import a_finding, all_checks

ALL_VERIFIED = all_checks()


def row(severity, confidence="certain"):
    return {**a_finding(severity=severity, confidence=confidence), "line_id": "L1"}


def test_blocker_beats_incomplete():
    assert verdict_for([row("blocker")], True, ALL_VERIFIED) == "fix_first"


def test_incomplete_beats_warning():
    assert verdict_for([row("warning")], True, ALL_VERIFIED) == "check_incomplete"


def test_missing_check_is_incomplete():
    assert verdict_for([], False, {}) == "check_incomplete"
    missing_one = {key: value for key, value in ALL_VERIFIED.items() if key != "time_zone"}
    assert verdict_for([], False, missing_one) == "check_incomplete"


def test_a_check_with_an_unknown_status_is_incomplete():
    assert verdict_for([], False, {**ALL_VERIFIED, "dates": "skipped"}) == "check_incomplete"


def test_an_unknown_severity_is_incomplete_but_a_blocker_still_wins():
    assert (
        verdict_for([{**row("info"), "severity": "Blocker"}], False, ALL_VERIFIED)
        == "check_incomplete"
    )
    assert (
        verdict_for([row("blocker"), {**row("info"), "severity": None}], False, ALL_VERIFIED)
        == "fix_first"
    )


def test_not_applicable_checks_count_as_ran():
    assert verdict_for([], False, all_checks("not_applicable")) == "ready"


def test_all_green_is_ready():
    assert verdict_for([row("info")], False, ALL_VERIFIED) == "ready"


def test_a_warning_is_ready_with_warnings():
    assert verdict_for([row("info"), row("warning")], False, ALL_VERIFIED) == "ready_with_warnings"


def test_an_open_unsure_finding_caps_the_verdict_whatever_its_severity():
    assert verdict_for([row("info", "unsure")], False, ALL_VERIFIED) == "ready_with_warnings"


@pytest.mark.parametrize(
    ("verdicts", "expected"),
    [
        (["ready", "fix_first", "check_incomplete"], "fix_first"),
        (["ready_with_warnings", "check_incomplete"], "check_incomplete"),
        (["ready", "ready_with_warnings"], "ready_with_warnings"),
        (["ready", "ready"], "ready"),
        ([], "check_incomplete"),
        (["ready", "approved"], "check_incomplete"),
    ],
)
def test_overall_uses_the_same_precedence(verdicts, expected):
    assert overall(verdicts) == expected


def test_review_as_json_string_or_garbage():
    review = {"locale": "de-DE", "checksum": "abc", "findings": []}
    assert parse_review(json.dumps(review)) == review and parse_review(review) == review
    assert parse_review("```json\n{}\n```") is None and parse_review(["x"]) is None
    assert (
        parse_review("ok") is None and parse_review('["x"]') is None and parse_review(None) is None
    )
