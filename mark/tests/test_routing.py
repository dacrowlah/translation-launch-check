"""The built conditions on the steps' real outputs, as Mark evaluates them: a regex over the
previous step's whole output text. Ties the condition literals to the code's route tokens."""

import json
import re

import pytest

import build
import read_and_check
import score
from _config import PRIVATE, RULES
from step_builders import a_checked_run, a_ctx, a_finding, save, scored


@pytest.fixture(scope="module")
def conditions(tmp_path_factory):
    out = tmp_path_factory.mktemp("dist")
    build.build(out, {"RULES": RULES, "PRIVATE": PRIVATE, "CEILINGS": build.ceilings()})
    workflow = json.loads((out / build.WORKFLOW_FILE).read_text(encoding="utf-8"))
    return {
        step["step_id"]: step["conditions"][0]
        for step in workflow["steps"]
        if step["step_type"] == "condition"
    }


def matches(condition, output):
    flags = 0 if condition["case_sensitive"] else re.IGNORECASE
    return re.search(condition["matching_condition"], json.dumps(output), flags) is not None


def test_is_the_file_usable_routes_read_and_checks_outputs(conditions, fake_tools, tmp_path):
    asked = read_and_check.handler({"trigger_name": "Chat"}, a_ctx(tmp_path / "a"))
    checked = a_checked_run(fake_tools, a_ctx(tmp_path / "b"))
    usable = conditions["step-usable"]
    assert (matches(usable, asked), matches(usable, checked)) == (True, False)


def test_anything_to_fix_routes_scores_outputs(conditions, fake_tools, tmp_path):
    ctx = a_ctx(tmp_path)
    checked = a_checked_run(fake_tools, ctx, {("de-DE", "L1"): [a_finding("numbers")]})
    save(ctx, checked, checked["locales"][0])
    fixing, anything = scored(ctx, checked)[0], conditions["step-anything"]
    reported = {**fixing, "route": "tlc_route_report"}
    assert [matches(anything, out) for out in (fixing, score.incomplete(), reported)] == [
        True,
        False,
        False,
    ]
