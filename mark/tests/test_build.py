"""The importable workflow as build.py assembles it from mark/workflow/workflow.json: the
step names and wiring, routing on the code steps' tokens, triggers, positions, the bundled
agents, and code that is exactly the inlined source."""

import ast
import json

import pytest

import build
from _build.agents import build_agent
from _build.inline import inline
from _config import PRIVATE, RULES
from builders import AGENTS_DIR, CODE_STEPS, MARK_DIR

CONFIG = {"RULES": RULES, "PRIVATE": PRIVATE, "CEILINGS": build.ceilings()}
STEP_NAMES = [
    "Read and check the file",
    "Is the file usable?",
    "Ask for a corrected file",
    "For each language",
    "Back-translate to English",
    "Review the translation",
    "Save the review",
    "Score each language",
    "Anything to fix?",
    "Suggest fixes",
    "Write and send the report",
]


@pytest.fixture(scope="module")
def workflow(tmp_path_factory):
    out = tmp_path_factory.mktemp("dist")
    build.build(out, CONFIG)
    return json.loads((out / build.WORKFLOW_FILE).read_text(encoding="utf-8"))


def all_steps(steps):
    return [each for step in steps for each in [step, *all_steps(step.get("child_steps", []))]]


def by_id(workflow):
    return {step["step_id"]: step for step in all_steps(workflow["steps"])}


def test_the_steps_have_the_eleven_names_in_flow_order(workflow):
    assert [step["name"] for step in all_steps(workflow["steps"])] == STEP_NAMES


def test_the_header_is_the_export_format(workflow):
    head = {
        key: workflow[key] for key in ("schema_version", "agent_type", "workflow_type", "agent_id")
    }
    assert head == {
        "schema_version": "1.3",
        "agent_type": "workflow",
        "workflow_type": "deterministic",
        "agent_id": "translation_launch_check",
    }


ROUTES = [
    ("step-usable", ("\\btlc_route_needs_info\\b", "step-needs-info", "step-loop")),
    ("step-anything", ("\\btlc_route_fix\\b", "step-fix", "step-report")),
]


@pytest.mark.parametrize(("step_id", "route"), ROUTES)
def test_conditions_match_the_code_steps_route_tokens_as_whole_words(workflow, step_id, route):
    token, target, otherwise = route
    first, rest = by_id(workflow)[step_id]["conditions"]
    assert (first["match_type"], first["matching_condition"], first["case_sensitive"]) == (
        "regex",
        token,
        True,
    )
    assert (first["target_step_id"], rest["match_type"], rest["target_step_id"]) == (
        target,
        "else",
        otherwise,
    )


def test_each_condition_follows_a_code_step(workflow):
    steps = all_steps(workflow["steps"])
    before = {step["next_step_id"]: step["step_type"] for step in steps if step.get("next_step_id")}
    assert [before[s["step_id"]] for s in steps if s["step_type"] == "condition"] == [
        "code",
        "code",
    ]


def test_the_loop_cap_is_the_first_steps_language_cap(workflow):
    loop = by_id(workflow)["step-loop"]
    assert (loop["items_source"], loop["item_name"], loop["parallel"]) == (
        "locales",
        "locale_item",
        True,
    )
    assert loop["max_iterations"] == RULES["limits"]["max_targets"] == 5


def test_the_triggers_are_chat_and_a_webhook_without_secrets(workflow):
    chat, webhook = workflow["triggers"]
    assert (chat["trigger_type"], webhook["trigger_type"], webhook["auth_key"]) == (
        "message",
        "webhook",
        None,
    )
    assert (
        webhook["name"] == "Translation Launch Check webhook"
        and "url" not in json.dumps(webhook).lower()
    )


def test_every_step_and_trigger_has_a_position_and_loop_children_are_relative(workflow):
    nodes = {node["id"]: node for node in workflow["agent_metadata"]["nodes"]}
    expected = {step["step_id"] for step in all_steps(workflow["steps"])} | {
        t["trigger_id"] for t in workflow["triggers"]
    }
    assert set(nodes) == expected
    children = [c["step_id"] for c in by_id(workflow)["step-loop"]["child_steps"]]
    assert [nodes[child].get("parentId") for child in children] == ["step-loop"] * 3


def test_code_steps_hold_exactly_the_inlined_source(workflow):
    source = json.loads((MARK_DIR / "workflow" / "workflow.json").read_text(encoding="utf-8"))
    files = {
        step["step_id"]: step["code_file"]
        for step in all_steps(source["steps"])
        if "code_file" in step
    }
    built = by_id(workflow)
    assert {sid: built[sid]["code"] for sid in files} == {
        sid: inline(CODE_STEPS / f, CONFIG) for sid, f in files.items()
    }
    assert "code_file" not in json.dumps(workflow) and all(
        built[sid]["language"] == "python" for sid in files
    )


def test_our_agents_are_bundled_and_all_three_required(workflow):
    assert workflow["specialized_agents_required"] == [
        "translation",
        "translation_review",
        "translation_fix_suggestions",
    ]
    ours = [
        build_agent(AGENTS_DIR / "translation_review"),
        build_agent(AGENTS_DIR / "translation_fix_suggestions"),
    ]
    assert workflow["specialized_agents"] == ours


def input_names(path):
    """The input_ keys a step reads: input_.get("<name>") calls in its own file."""
    calls = (
        n for n in ast.walk(ast.parse(path.read_text(encoding="utf-8"))) if isinstance(n, ast.Call)
    )
    gets = (
        c
        for c in calls
        if isinstance(c.func, ast.Attribute)
        and c.func.attr == "get"
        and getattr(c.func.value, "id", "") == "input_"
    )
    return {c.args[0].value for c in gets}


def test_each_code_steps_inputs_are_what_its_code_reads(workflow):
    source = json.loads((MARK_DIR / "workflow" / "workflow.json").read_text(encoding="utf-8"))
    steps = [s for s in all_steps(source["steps"]) if "code_file" in s]
    assert {s["code_file"]: set(s["parameters_schema"]) for s in steps} == {
        s["code_file"]: input_names(CODE_STEPS / s["code_file"]) for s in steps
    }


def test_each_agent_steps_inputs_are_the_agents_parameters(workflow):
    steps = [
        s
        for s in all_steps(workflow["steps"])
        if s["step_type"] == "specialized" and s["agent_id"] != "translation"
    ]
    for step in steps:
        agent = build_agent(AGENTS_DIR / step["agent_id"])
        assert set(step["parameters_schema"]) == {p["name"] for p in agent["parameters"]}
    assert set(by_id(workflow)["step-bt"]["parameters_schema"]) == {"content", "language"}


def test_every_input_is_predicted_and_described(workflow):
    inputs = [
        i for s in all_steps(workflow["steps"]) for i in s.get("parameters_schema", {}).values()
    ]
    assert {i["type"] for i in inputs} == {"predicted"} and all(
        len(i["description"]) > 20 for i in inputs
    )
