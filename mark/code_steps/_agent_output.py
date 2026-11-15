"""An agent's answer as the orchestrator model passes it for "the whole output of the step":
usually the answer itself, sometimes the agent's whole execution record (seen live: metrics,
response, token_usage), with the answer as its response. Nothing here raises."""

from _model_output import json_object


def _is_record(value):
    """An agent step's whole execution record ({metrics, response, token_usage, ...}) rather
    than its answer: the orchestrator model sometimes passes one for "the whole output"."""
    keys = isinstance(value, dict) and ("metrics" in value or "token_usage" in value)
    return keys and "response" in value


def agent_answer(raw):
    """An agent's JSON answer as a dict: given as an object, as JSON text, or inside its
    execution record (the record and its response each an object or JSON text); else None."""
    value = json_object(raw)
    return json_object(value["response"]) if _is_record(value) else value


def agent_text(raw):
    """An agent's text answer: the text as given, or a record's text response; else ""."""
    value = json_object(raw)
    text = value["response"] if _is_record(value) else raw
    return text if isinstance(text, str) else ""
