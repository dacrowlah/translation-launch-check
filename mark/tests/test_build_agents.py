"""The two specialized agents as built from mark/agents/<agent_id>/: export-format JSON
(schema_version 1.3) whose prompt, parameters, tools and enforced output schema keep the
contract the workflow relies on."""

import json
import re

import pytest

from _build.agents import build_agent
from builders import FIX_DIR as FIX
from builders import REVIEW_DIR as REVIEW

BOTH = (REVIEW, FIX)
GLOSSARY_PIN = "{skill: `market-rules-glossary`}"


def _prompt(agent_dir):
    return build_agent(agent_dir)["prompt_template"]


@pytest.mark.parametrize("agent_dir", BOTH, ids=lambda d: d.name)
def test_common_export_values(agent_dir):
    agent = build_agent(agent_dir)
    expected = {"schema_version": "1.3", "agent_type": "specialized", "inference_type": "simple"}
    assert {key: agent[key] for key in expected} == expected
    assert agent["agent_id"] == agent_dir.name
    assert agent["output"]["type"] == "json"


@pytest.mark.parametrize("agent_dir", BOTH, ids=lambda d: d.name)
def test_agents_have_no_ask_user_question_and_chat_off(agent_dir):
    agent = build_agent(agent_dir)
    assert agent["is_enabled_in_chat"] is False
    assert agent["conversation_mode"] is False
    assert "ask_user_question" not in agent["enabled_tools"]
    assert "ask_user_question" not in agent["prompt_template"]


@pytest.mark.parametrize("agent_dir", BOTH, ids=lambda d: d.name)
def test_every_prompt_variable_is_a_parameter(agent_dir):
    agent = build_agent(agent_dir)
    variables = set(re.findall(r"\[\[(.*?)\]\]", agent["prompt_template"]))
    assert variables == {p["name"] for p in agent["parameters"]}


def test_review_parameters_are_four_required_strings():
    params = build_agent(REVIEW)["parameters"]
    assert [(p["name"], p["type"], p["required"]) for p in params] == [
        ("locale", "string", True),
        ("review_input", "string", True),
        ("back_translation", "string", True),
        ("checksum", "string", True),
    ]


def test_fixer_parameter_is_one_required_string():
    params = build_agent(FIX)["parameters"]
    assert [(p["name"], p["type"], p["required"]) for p in params] == [
        ("fix_input", "string", True)
    ]


def test_review_has_no_tools():
    assert build_agent(REVIEW)["enabled_tools"] == []


def test_fixer_has_only_copy_fit_check():
    assert build_agent(FIX)["enabled_tools"] == ["copy_fit_check"]


def test_review_pins_the_glossary_with_backticks():
    prompt = _prompt(REVIEW)
    assert prompt.startswith(GLOSSARY_PIN)
    assert "auto-tool" not in prompt


def test_fixer_pins_the_glossary_and_attaches_skills_by_tool():
    agent = build_agent(FIX)
    assert agent["prompt_template"].startswith(GLOSSARY_PIN + "\n{skill: **auto-tool**}\n")
    assert agent["agent_metadata"]["enable_auto_skill_prediction_by_tools"] is True


def test_review_does_not_attach_skills_by_tool():
    assert build_agent(REVIEW)["agent_metadata"]["enable_auto_skill_prediction_by_tools"] is False


@pytest.mark.parametrize("agent_dir", BOTH, ids=lambda d: d.name)
def test_skill_directives_are_only_the_pins(agent_dir):
    """Any other `{skill:` text would be read as a directive or a skill search."""
    directives = re.findall(r"\{skill:[^}]*\}", _prompt(agent_dir))
    assert set(directives) <= {GLOSSARY_PIN, "{skill: **auto-tool**}"}


@pytest.mark.parametrize("agent_dir", BOTH, ids=lambda d: d.name)
def test_built_agent_takes_its_prompt_and_schema_from_their_files(agent_dir):
    agent = build_agent(agent_dir)
    assert agent["prompt_template"] == (agent_dir / "prompt.md").read_text(encoding="utf-8")
    schema = json.loads((agent_dir / "output.schema.json").read_text(encoding="utf-8"))
    assert agent["output"]["schema"] == schema


@pytest.mark.parametrize("agent_dir", BOTH, ids=lambda d: d.name)
def test_agent_json_does_not_hold_the_prompt_or_schema(agent_dir):
    """One source for each: the prompt in prompt.md, the schema in output.schema.json."""
    source = json.loads((agent_dir / "agent.json").read_text(encoding="utf-8"))
    assert "prompt_template" not in source
    assert "schema" not in source["output"]


def _agent_dir_with(tmp_path, extra):
    """A copy of Translation Review's sources whose agent.json also holds `extra`."""
    for name in ("prompt.md", "output.schema.json"):
        (tmp_path / name).write_text((REVIEW / name).read_text(encoding="utf-8"), encoding="utf-8")
    source = json.loads((REVIEW / "agent.json").read_text(encoding="utf-8"))
    (tmp_path / "agent.json").write_text(json.dumps({**source, **extra}))
    return tmp_path


def test_build_agent_refuses_a_prompt_in_agent_json(tmp_path):
    with pytest.raises(ValueError, match="prompt_template belongs in prompt.md"):
        build_agent(_agent_dir_with(tmp_path, {"prompt_template": "x"}))


def test_build_agent_refuses_a_schema_in_agent_json(tmp_path):
    output = {"type": "json", "description": "d", "schema": {}}
    with pytest.raises(ValueError, match="the output schema belongs in output.schema.json"):
        build_agent(_agent_dir_with(tmp_path, {"output": output}))
