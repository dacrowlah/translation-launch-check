"""Mark counts a code step's code toward its 75,776-byte event cap, so each step has a code
ceiling (enforced by the build) and an input budget (what the ceiling leaves). These tests
pin the budgets, the build's guard, the shrinking that keeps the code small, and that each
step's largest realistic input fits its budget."""

import json

import pytest

import build
from _budgets import (
    CODE_CEILINGS,
    FIX_BOUNDS,
    MAX_CODE_BYTES,
    REVIEW_BOUNDS,
    fix_overhead,
    input_budget,
    review_allowance,
)
from _build.agents import build_agent
from _build.inline import inline
from _build.shrink import shrink
from _build.workflow import WorkflowError, assemble
from _config import PRIVATE, RULES
from builders import AGENTS_DIR, CODE_STEPS, MARK_DIR

CONFIG = {"RULES": RULES, "PRIVATE": PRIVATE, "CEILINGS": build.ceilings()}
STEPS = ("read_and_check", "save_review", "score", "report", "needs_info")


def test_each_step_has_a_ceiling_under_the_cap_and_these_input_budgets():
    assert (
        sorted(CODE_CEILINGS) == sorted(STEPS)
        and max(CODE_CEILINGS.values()) <= MAX_CODE_BYTES == 60_000
    )
    budgets = {step: input_budget(step) for step in STEPS}
    assert budgets == {
        "read_and_check": 28_000,
        "save_review": 58_000,
        "score": 44_000,
        "report": 26_000,
        "needs_info": 47_000,
    }


@pytest.mark.parametrize("step", STEPS)
def test_every_built_step_is_under_its_ceiling_escaped(step):
    assert len(json.dumps(inline(CODE_STEPS / f"{step}.py", CONFIG))) <= CODE_CEILINGS[step]


def source():
    return json.loads((MARK_DIR / "workflow" / "workflow.json").read_text(encoding="utf-8"))


def test_the_build_refuses_a_step_over_its_ceiling():
    folders = {"steps": CODE_STEPS, "agents": AGENTS_DIR}
    tight = {**CONFIG, "CEILINGS": {**CONFIG["CEILINGS"], "report": 1_000}}
    with pytest.raises(
        WorkflowError, match=r"report\.py builds to \d+ escaped bytes; its ceiling is 1000"
    ):
        assemble(source(), folders, tight)


def test_the_ceiling_counts_the_code_json_escaped():
    raw = len(inline(CODE_STEPS / "report.py", CONFIG).encode())
    tight = {**CONFIG, "CEILINGS": {**CONFIG["CEILINGS"], "report": raw + 1}}
    with pytest.raises(WorkflowError, match="report.py builds to"):
        assemble(source(), {"steps": CODE_STEPS, "agents": AGENTS_DIR}, tight)


def test_the_build_refuses_a_step_without_a_ceiling():
    folders = {"steps": CODE_STEPS, "agents": AGENTS_DIR}
    missing = {**CONFIG, "CEILINGS": {k: v for k, v in CONFIG["CEILINGS"].items() if k != "score"}}
    with pytest.raises(WorkflowError, match="score.py builds to .* its ceiling is 0"):
        assemble(source(), folders, missing)


SPRAWLING = '''"""A module."""
# a comment


def f():
    """Only a docstring."""


def g(x):
    "a docstring"
    if x:
        return [1, 2]  # trailing comment

    return None
"""A helper's docstring, mid-file."""
'''


def test_shrink_drops_docstrings_comments_and_blank_lines_and_keeps_behaviour():
    small = shrink(SPRAWLING)
    assert small == "def f():\n pass\ndef g(x):\n if x:\n  return [1, 2]\n return None"
    namespace = {}
    exec(compile(small, "small", "exec"), namespace)  # noqa: S102 - our own test code
    assert (namespace["f"](), namespace["g"](1), namespace["g"](0)) == (None, [1, 2], None)


def test_the_build_enforces_each_ceiling_and_never_more_than_the_maximum(monkeypatch):
    assert build.ceilings() == CODE_CEILINGS
    monkeypatch.setitem(CODE_CEILINGS, "report", 70_000)
    assert build.ceilings()["report"] == MAX_CODE_BYTES


def bounds(schema, items_key):
    """{key: maxItems or maxLength} of an output schema's array and its items' fields."""
    array = schema["properties"][items_key]
    fields = {
        k: v["maxLength"] for k, v in array["items"]["properties"].items() if "maxLength" in v
    }
    return {items_key: array["maxItems"], **fields}


def test_the_agents_output_schemas_carry_exactly_the_budgeted_bounds():
    review = build_agent(AGENTS_DIR / "translation_review")["output"]["schema"]
    fixes = build_agent(AGENTS_DIR / "translation_fix_suggestions")["output"]["schema"]
    assert {**bounds(review, "findings"), **bounds(review, "rule_checks")} == REVIEW_BOUNDS
    assert bounds(fixes, "fixes") == FIX_BOUNDS


def test_the_allowances_derive_from_the_bounds():
    # 20 findings x (40 + 240 + 6 x 120 + 120) + 20 opinions x (40 + 200 + 120) + 120
    assert (review_allowance(), fix_overhead()) == (29_720, 400)
