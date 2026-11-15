"""The agents' enforced output schemas, and the worked examples in their prompts, which must
fit those schemas exactly (the model copies the shape it is shown)."""

import json
import re

import pytest

from _build.agents import build_agent
from builders import FIX_DIR as FIX
from builders import REVIEW_DIR as REVIEW
from builders import schema_errors

BOTH = (REVIEW, FIX)


def _schema(agent_dir):
    return build_agent(agent_dir)["output"]["schema"]


def _json_examples(agent_dir):
    """Every fenced ```json block in an agent's prompt, parsed."""
    prompt = build_agent(agent_dir)["prompt_template"]
    return [json.loads(block) for block in re.findall(r"```json\n(.*?)```", prompt, re.S)]


def _object_nodes(schema):
    if schema.get("type") == "object":
        yield schema
        for child in schema["properties"].values():
            yield from _object_nodes(child)
    if schema.get("type") == "array":
        yield from _object_nodes(schema["items"])


@pytest.mark.parametrize(
    ("agent_dir", "objects"), [(REVIEW, 3), (FIX, 2)], ids=["translation_review", "fixer"]
)
def test_schema_is_strict_at_every_level(agent_dir, objects):
    nodes = list(_object_nodes(_schema(agent_dir)))
    assert len(nodes) == objects
    for node in nodes:
        assert node["additionalProperties"] is False
        assert node["required"] == list(node["properties"])


def test_review_schema_fields_and_enums():
    props = _schema(REVIEW)["properties"]
    assert list(props) == ["locale", "checksum", "findings", "rule_checks"]
    finding = props["findings"]["items"]["properties"]
    assert list(finding) == ["line_id", "check", "severity", "detail", "evidence"]
    assert finding["check"]["enum"] == ["meaning", "claim", "tone", "idiom", "untranslated"]
    assert finding["severity"]["enum"] == ["blocker", "warning", "info"]
    rule_check = props["rule_checks"]["items"]["properties"]
    assert list(rule_check) == ["finding_id", "opinion", "reason"]
    assert rule_check["opinion"]["enum"] == ["real_problem", "same_meaning", "cannot_tell"]


def test_review_does_not_echo_the_back_translation():
    """Save the review takes the back-translation from its own step (spec 6.3)."""
    assert "back_translation" not in _schema(REVIEW)["properties"]


def test_fixer_schema_fields():
    props = _schema(FIX)["properties"]
    fix = props["fixes"]["items"]["properties"]
    assert list(props) == ["fixes"]
    assert list(fix) == ["locale", "line_id", "suggested_text", "fits", "note"]
    assert fix["fits"] == {"type": "boolean"}


@pytest.mark.parametrize(
    ("agent_dir", "count"), [(REVIEW, 3), (FIX, 2)], ids=["translation_review", "fixer"]
)
def test_worked_examples_match_the_enforced_schema(agent_dir, count):
    examples = _json_examples(agent_dir)
    assert len(examples) == count
    for example in examples:
        assert schema_errors(example, _schema(agent_dir)) == []


def test_review_examples_show_each_opinion_and_both_claim_severities():
    examples = _json_examples(REVIEW)
    opinions = {c["opinion"] for e in examples for c in e["rule_checks"]}
    claims = {f["severity"] for e in examples for f in e["findings"] if f["check"] == "claim"}
    assert opinions == {"real_problem", "same_meaning", "cannot_tell"}
    assert claims == {"blocker", "warning"}


def test_review_examples_include_a_clean_result():
    """The false-alarm example must stay empty: it teaches what not to report."""
    clean = {"findings": [], "rule_checks": []}
    assert clean in [{key: e[key] for key in clean} for e in _json_examples(REVIEW)]


@pytest.mark.parametrize("agent_dir", BOTH, ids=lambda d: d.name)
def test_agent_source_files_are_ascii(agent_dir):
    for path in sorted(agent_dir.iterdir()):
        assert path.read_text(encoding="utf-8").isascii(), path.name


def test_schema_errors_accepts_a_matching_value():
    fix = {"locale": "de-DE", "line_id": "L1", "suggested_text": "x", "fits": True, "note": "n"}
    assert schema_errors({"fixes": [fix]}, _schema(FIX)) == []


def test_schema_errors_names_each_mismatch():
    finding = {"line_id": "L1", "check": "style", "severity": "info", "detail": "d", "evidence": 1}
    value = {"locale": "de-DE", "findings": [finding], "rule_checks": [], "extra": True}
    assert schema_errors(value, _schema(REVIEW)) == [
        "$: missing checksum",
        "$: unexpected extra",
        "$.findings[0].check: 'style' not in enum",
        "$.findings[0].evidence: expected string",
    ]
