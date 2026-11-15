"""The workflow import JSON (export format, schema_version 1.3) from mark/workflow/workflow.json:
each code step's `code_file` becomes its inlined `code`, the loop's max_iterations comes from
the rules (the same cap the first step enforces), and our specialized agents are bundled as
an export bundles them. The prebuilt Content Translation agent (`translation`) is only listed
as required: an import resolves it to the agent already installed."""

import json

from _build.agents import build_agent
from _build.inline import inline

SOURCE_ONLY = "code_file"


class WorkflowError(ValueError):
    """The workflow source is malformed."""


def _within_ceiling(built, name, ceilings):
    """Mark counts a step's code toward its event: refuse a step whose JSON-escaped code is
    over its ceiling (CEILINGS, from code_steps/_budgets.py), or a step with no ceiling."""
    size, ceiling = len(json.dumps(built)), ceilings.get(name, 0)
    if size > ceiling:
        raise WorkflowError(f"{name}.py builds to {size} escaped bytes; its ceiling is {ceiling}")
    return built


def _source_path(step, folders):
    if "code" in step:
        raise WorkflowError("code belongs in mark/code_steps, by code_file: " + step["step_id"])
    return folders["steps"] / step[SOURCE_ONLY]


def _code_step(step, folders, config):
    path = _source_path(step, folders)
    built = _within_ceiling(inline(path, config), path.stem, config["CEILINGS"])
    kept = {key: value for key, value in step.items() if key != SOURCE_ONLY}
    return {**kept, "language": "python", "code": built}


def _loop_step(step, folders, config):
    children = [_built_step(child, folders, config) for child in step["child_steps"]]
    cap = config["RULES"]["limits"]["max_targets"]
    return {**step, "max_iterations": cap, "child_steps": children}


def _built_step(step, folders, config):
    if step["step_type"] == "code":
        return _code_step(step, folders, config)
    return _loop_step(step, folders, config) if step["step_type"] == "for_loop" else step


def _step_agents(step):
    return [step.get("agent_id"), *agent_ids(step.get("child_steps", []))]


def agent_ids(steps):
    """Every agent_id the steps use, loop children included, in flow order, once each."""
    found = [agent for step in steps for agent in _step_agents(step)]
    return list(dict.fromkeys(agent for agent in found if agent))


def _bundled(ids, agents_dir):
    return [build_agent(agents_dir / agent) for agent in ids if (agents_dir / agent).is_dir()]


def _agents(source, folders):
    ids = agent_ids(source["steps"])
    return {
        "specialized_agents": _bundled(ids, folders["agents"]),
        "specialized_agents_required": ids,
    }


def _webhook_named(source, private):
    """The webhook trigger's name must be the one Read and check the file accepts, when the
    private config names one (a mismatch would turn every webhook run away)."""
    names = [t["name"] for t in source["triggers"] if t["trigger_type"] == "webhook"]
    wanted = private.get("webhook_trigger_name")
    if wanted is not None and names != [wanted]:
        raise WorkflowError("the webhook trigger's name differs from webhook_trigger_name")


def assemble(source, folders, config):
    """The importable workflow. folders: steps (mark/code_steps) and agents (mark/agents);
    config: the literal RULES and PRIVATE for the code steps, and CEILINGS, each step's
    escaped code limit in bytes."""
    _webhook_named(source, config["PRIVATE"])
    steps = [_built_step(step, folders, config) for step in source["steps"]]
    return {**source, "steps": steps, **_agents(source, folders)}
