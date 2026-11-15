import pytest

from step_builders import (
    a_checked_run,
    a_ctx,
    a_finding,
    a_review,
    a_review_finding,
    a_rule_check,
    save,
    scored,
)

UNSURE = a_finding("currency_code", "warning", "unsure", detail="Is CHF 30 the same price?")


def score_with(fake_tools, tmp_path, findings=None, review=None):
    ctx = a_ctx(tmp_path)
    checked = a_checked_run(fake_tools, ctx, findings)
    item = checked["locales"][0]
    save(ctx, checked, item, review=review(item))
    return scored(ctx, checked)[1]["locales"][0]


@pytest.mark.parametrize("line_id", ["[L2]", " L2 ", "L2, L1", "[L2], [L1]"])
def test_an_obvious_line_id_form_is_read_as_the_line(fake_tools, tmp_path, line_id):
    def review(item):
        return a_review(item, [a_review_finding(line_id, "tone", "warning")])

    found = score_with(fake_tools, tmp_path, review=review)
    assert [(f["line_id"], f["check"]) for f in found["findings"]] == [("L2", "tone")]


MIXED_NOTES = [
    a_review_finding("L9"),
    a_review_finding("L2", "tone", "warning"),
    a_review_finding(7),
]


def test_a_note_matching_no_line_is_dropped_and_counted_and_the_rest_kept(fake_tools, tmp_path):
    found = score_with(fake_tools, tmp_path, review=lambda item: a_review(item, MIXED_NOTES))
    assert (found["verdict"], found["not_checked"]) == ("ready_with_warnings", False)
    assert found["unmatched_notes"] == 2 and [f["line_id"] for f in found["findings"]] == ["L2"]


@pytest.mark.parametrize("finding_id", ["[R1]", "r1", " R1 "])
def test_an_obvious_finding_id_form_is_read_as_the_ref(fake_tools, tmp_path, finding_id):
    def review(item):
        return a_review(item, rule_checks=[a_rule_check(finding_id, "real_problem")])

    found = score_with(fake_tools, tmp_path, {("de-DE", "L1"): [UNSURE]}, review)
    assert found["findings"][0]["opinion"] == "real_problem"


def test_a_route_token_as_a_check_name_is_defused(fake_tools, tmp_path):
    def review(item):
        return a_review(item, [a_review_finding("L2", "tlc_route_fix", "warning")])

    assert (
        score_with(fake_tools, tmp_path, review=review)["findings"][0]["check"] == "tlc-route-fix"
    )


@pytest.mark.parametrize("severity", ["Blocker", None, "major"])
def test_an_unknown_tool_severity_is_incomplete_never_ready(fake_tools, tmp_path, severity):
    findings = {("de-DE", "L1"): [{**a_finding("numbers"), "severity": severity}]}
    found = score_with(fake_tools, tmp_path, findings, lambda item: a_review(item))
    assert found["verdict"] == "check_incomplete"


@pytest.mark.parametrize("confidence", ["Unsure", "maybe", None])
def test_an_unknown_confidence_counts_as_unsure(fake_tools, tmp_path, confidence):
    findings = {("de-DE", "L1"): [{**a_finding("formality", "info"), "confidence": confidence}]}
    found = score_with(fake_tools, tmp_path, findings, lambda item: a_review(item))
    assert (found["findings"][0]["confidence"], found["verdict"]) == (
        "unsure",
        "ready_with_warnings",
    )
