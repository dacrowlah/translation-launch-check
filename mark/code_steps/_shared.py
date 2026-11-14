import hashlib
import json

from opal_tms_sdk import tools

from _text import TEXT


def canonical_json(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def facts_checksum(value):
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()[:16]


def _bad_status(body):
    code = body.get("status_code") if isinstance(body, dict) else None
    return isinstance(code, int) and not isinstance(code, bool) and code >= 400


def _failed(result):
    if not isinstance(result, dict):
        return True
    return result.get("response_type") == "error" or _bad_status(result.get("response"))


def call_tool(name, **params):
    result = getattr(tools, name)(**params)
    if _failed(result):
        return {"ok": False, "body": None}
    return {"ok": True, "body": result["response"]}


def _internal_error():
    problem = {"where": "", "message": TEXT["internal_error"], "suggestion": ""}
    return {"route": "needs_info", "problems": [problem], "summary": "internal error"}


def run_safely(impl, input, ctx, fallback=None):  # noqa: A002
    try:
        return impl(input, ctx)
    except Exception:
        return fallback if fallback is not None else _internal_error()
