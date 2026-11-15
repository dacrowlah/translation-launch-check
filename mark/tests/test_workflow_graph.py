"""The workflow's wiring as Mark will follow it: the step graph, the branch join, the trigger
edges, every input mapped to a field its source step really returns, and the inputs a null
from an earlier step must not break."""

import json
import re

import pytest

import build
import read_and_check
import report
import score
from _build.workflow import WorkflowError, assemble
from _config import PRIVATE, RULES
from builders import AGENTS_DIR, CODE_STEPS, MARK_DIR
from step_builders import a_checked_run, a_ctx, a_finding, save, scored

CONFIG = {"RULES": RULES, "PRIVATE": PRIVATE, "CEILINGS": build.ceilings()}
FOLDERS = {"steps": CODE_STEPS, "agents": AGENTS_DIR}
NEXT = {
    "step-read": "step-usable",
    "step-usable": None,
    "step-needs-info": None,
    "step-loop": "step-score",
    "step-bt": "step-review",
    "step-review": "step-save",
    "step-save": None,
    "step-score": "step-anything",
    "step-anything": None,
    "step-fix": "step-report",
    "step-report": None,
}
TARGETS = {
    "step-usable": ["step-needs-info", "step-loop"],
    "step-anything": ["step-fix", "step-report"],
}
FIELDS = {
    ("step-needs-info", "problems"): ("Read and check the file", "problems"),
    ("step-bt", "content"): ("locale_item", "back_translation_input"),
    ("step-review", "locale"): ("locale_item", "locale"),
    ("step-review", "review_input"): ("locale_item", "review_input"),
    ("step-review", "checksum"): ("locale_item", "checksum"),
    ("step-save", "run_key"): ("Read and check the file", "run_key"),
    ("step-save", "locale"): ("locale_item", "locale"),
    ("step-save", "checksum"): ("locale_item", "checksum"),
    ("step-score", "run_key"): ("Read and check the file", "run_key"),
    ("step-score", "check_checksum"): ("Read and check the file", "check_checksum"),
    ("step-fix", "fix_input"): ("Score each language", "fix_input"),
    ("step-report", "run_key"): ("Score each language", "run_key"),
    ("step-report", "verdict_checksum"): ("Score each language", "verdict_checksum"),
}
OTHER_INPUTS = {
    ("step-read", "trigger_name"): "trigger_context.trigger_name, unchanged",
    ("step-read", "webhook_payload"): (
        "trigger_context.webhook_payload, unchanged; absent for chat runs; used only on the"
        " configured webhook trigger and only when its package_sha256 verifies"
    ),
    ("step-bt", "language"): "Always exactly the word English.",
    ("step-review", "back_translation"): (
        "The whole output of the step 'Back-translate to English' for this locale_item, unchanged"
    ),
    ("step-save", "review"): (
        "The whole output of the step 'Review the translation' for this locale_item, unchanged"
    ),
    ("step-save", "back_translation"): (
        "The whole output of the step 'Back-translate to English' for this locale_item, unchanged"
    ),
    ("step-report", "fixes"): (
        "The whole output of the step 'Suggest fixes' if it ran in this run, unchanged;"
        " absent otherwise"
    ),
}
FIELD = re.compile(r"The (\w+) field of (?:the step '([^']+)'|the current (locale_item))")


def source():
    return json.loads((MARK_DIR / "workflow" / "workflow.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def workflow():
    return assemble(source(), FOLDERS, CONFIG)


def all_steps(steps):
    return [each for step in steps for each in [step, *all_steps(step.get("child_steps", []))]]


def test_the_step_graph_is_exactly_this(workflow):
    steps = all_steps(workflow["steps"])
    assert {step["step_id"]: step["next_step_id"] for step in steps} == NEXT
    targets = {s["step_id"]: [c["target_step_id"] for c in s.get("conditions", [])] for s in steps}
    assert {step_id: found for step_id, found in targets.items() if found} == TARGETS
    children = [child["step_id"] for child in workflow["steps"][3]["child_steps"]]
    assert children == ["step-bt", "step-review", "step-save"]


def test_the_report_is_the_branch_join_and_every_reference_resolves(workflow):
    steps = all_steps(workflow["steps"])
    leads = [
        (s["step_id"], t)
        for s in steps
        for t in [s["next_step_id"], *TARGETS.get(s["step_id"], [])]
        if t
    ]
    assert {source for source, target in leads if target == "step-report"} == {
        "step-fix",
        "step-anything",
    }
    assert {target for _, target in leads} <= {step["step_id"] for step in steps}


def test_both_triggers_lead_to_the_first_step(workflow):
    edges = [(e["source"], e["target"]) for e in workflow["agent_metadata"]["edges"]]
    assert edges == [("trigger-chat", "step-read"), ("trigger-webhook", "step-read")]
    assert workflow["steps"][0]["step_id"] == "step-read"


def mapped_fields(workflow):
    """{(step_id, input): (source, field)} for every "The X field of ..." description."""
    found = {}
    for step in all_steps(workflow["steps"]):
        for name, spec in step.get("parameters_schema", {}).items():
            match = FIELD.match(spec["description"])
            found |= {(step["step_id"], name): (match[2] or match[3], match[1])} if match else {}
    return found


def test_every_field_input_is_mapped_to_exactly_this_source_field(workflow):
    assert mapped_fields(workflow) == FIELDS


def real_outputs(fake_tools, tmp_path):
    """The keys each source really returns: both routes of Read, Score, and a loop item."""
    asked = read_and_check.handler({"trigger_name": "Chat"}, a_ctx(tmp_path / "a"))
    ctx = a_ctx(tmp_path / "b")
    checked = a_checked_run(fake_tools, ctx, {("de-DE", "L1"): [a_finding("numbers")]})
    save(ctx, checked, checked["locales"][0])
    keys = {
        "Read and check the file": set(asked) | set(checked),
        "Score each language": set(scored(ctx, checked)[0]),
    }
    return {**keys, "locale_item": set(checked["locales"][0])}


def test_every_mapped_field_is_one_its_source_really_returns(workflow, fake_tools, tmp_path):
    outputs = real_outputs(fake_tools, tmp_path)
    assert [
        (key, field)
        for key, (src, field) in mapped_fields(workflow).items()
        if field not in outputs[src]
    ] == []


def test_every_other_input_has_exactly_this_description(workflow):
    found = {
        (step["step_id"], name): spec["description"]
        for step in all_steps(workflow["steps"])
        for name, spec in step.get("parameters_schema", {}).items()
        if not FIELD.match(spec["description"])
    }
    assert found == OTHER_INPUTS


def test_inputs_an_earlier_step_may_leave_null_are_not_required(workflow, tmp_path):
    report_inputs = next(s for s in workflow["steps"] if s["step_id"] == "step-report")[
        "parameters_schema"
    ]
    assert [name for name, spec in report_inputs.items() if spec["required"]] == []
    assert (score.incomplete()["run_key"], score.incomplete()["verdict_checksum"]) == (None, None)
    answer = report.handler({"run_key": None, "verdict_checksum": None}, a_ctx(tmp_path))
    assert answer["message"].startswith("Overall: Check incomplete - re-run.")


def test_the_built_code_is_ascii_and_the_loop_cap_follows_the_rules():
    planted = {**CONFIG, "RULES": {**RULES, "limits": {**RULES["limits"], "max_targets": 3}}}
    built = assemble(source(), FOLDERS, planted)
    assert next(s for s in built["steps"] if s["step_type"] == "for_loop")["max_iterations"] == 3
    assert all(step["code"].isascii() for step in all_steps(built["steps"]) if "code" in step)


def test_a_source_step_carrying_its_own_code_is_refused():
    planted = source()
    planted["steps"][0]["code"] = "def handler(input, ctx): ..."
    with pytest.raises(WorkflowError, match="code belongs in mark/code_steps"):
        assemble(planted, FOLDERS, CONFIG)
