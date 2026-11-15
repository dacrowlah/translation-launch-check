"""Specialized agents: mark/agents/<agent_id>/ to export-format JSON (schema_version 1.3).

Each agent has one source per part: agent.json (settings and parameters), prompt.md (the
prompt template) and output.schema.json (the enforced output schema).
"""

import json
from pathlib import Path


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def build_agent(agent_dir: Path) -> dict:
    """The importable agent: agent.json with prompt_template from prompt.md and
    output.schema from output.schema.json."""
    agent = json.loads(_read(agent_dir / "agent.json"))
    _refuse_inline_sources(agent, agent_dir.name)
    output = {**agent["output"], "schema": json.loads(_read(agent_dir / "output.schema.json"))}
    return {**agent, "prompt_template": _read(agent_dir / "prompt.md"), "output": output}


def _refuse_inline_sources(agent, name):
    if "prompt_template" in agent:
        raise ValueError("prompt_template belongs in prompt.md: " + name)
    if "schema" in agent["output"]:
        raise ValueError("the output schema belongs in output.schema.json: " + name)
