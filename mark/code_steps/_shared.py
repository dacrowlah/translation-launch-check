"""Tool calls and the last-resort guard, shared by every code step (inlined at build).
Platform-tool helpers live in _platform.

Nothing here raises or prints: Mark's chat narrates stdout and stderr to the user.
"""

from opal_tms_sdk import tools

from _checksum import json_size
from _routes import ROUTE_NEEDS_INFO
from _text import TEXT

TOOL_STATUSES = ("ok", "invalid_input", "internal_error", "invalid_request")
MAX_RETURN_BYTES = 250_000  # under the 256 KB return limit (a bigger return becomes null)


def _invoke(tool, params):
    try:
        return getattr(tools, tool)(**params)
    except Exception:  # the SDK defines ToolInvocationError, ToolUnavailableError, ...
        return None


def _float(text):
    try:
        return float(text)
    except ValueError:
        return 0


def _number(code):
    return _float(code) if isinstance(code, str) else code


def _http_failure(code):
    """A status_code of 400 or more, as an int, a float or a numeric string."""
    return isinstance(code, int | float | str) and _number(code) >= 400


def _body(result):
    """The response body, or None: error envelope, non-dict result, status_code >= 400."""
    if not isinstance(result, dict) or result.get("response_type") == "error":
        return None
    body = result.get("response")
    code = body.get("status_code") if isinstance(body, dict) else None
    return None if _http_failure(code) else body


def _status(body):
    status = body.get("status") if isinstance(body, dict) else None
    return status if status in TOOL_STATUSES else "unavailable"


def call_tool(tool, /, **params):
    """Our own tool: {"ok", "status", "body"}. status is the tool's token, or "unavailable";
    the body is passed on only with status "ok". The name is positional-only, so a tool
    parameter called `name` still works."""
    body = _body(_invoke(tool, params))
    status = _status(body)
    return {"ok": status == "ok", "status": status, "body": body if status == "ok" else None}


def _payload(body):
    """A platform tool's result sits under `data` (verified for create_canvas: success, type,
    result, file_contents, data, error); a body without a data object is read as it is. A
    set `error` is a failure."""
    if not isinstance(body, dict) or body.get("error") is not None:
        return None
    data = body.get("data")
    return data if isinstance(data, dict) else body


def call_platform(tool, /, **params):
    """A platform tool (no status token of ours): its result dict or None; callers check
    fields."""
    return _payload(_body(_invoke(tool, params)))


def _internal_error():
    problem = {"where": "", "message": TEXT["internal_error"], "suggestion": ""}
    summary = TEXT["internal_error_summary"]
    return {"route": ROUTE_NEEDS_INFO, "problems": [problem], "summary": summary}


def _returnable(result):
    """A dict Mark can return: plain JSON (no set, NaN or tuple) within MAX_RETURN_BYTES,
    measured escaped (json_size), the largest form."""
    size = json_size(result) if isinstance(result, dict) else None
    return size is not None and size <= MAX_RETURN_BYTES


def _guarded(impl, input_, ctx):
    try:
        result = impl(input_, ctx)
    except (Exception, SystemExit):  # SystemExit would print its text to stderr
        return None
    return result if _returnable(result) else None


def run_safely(impl, input_, ctx, fallback=None):
    """The one broad guard: an exception, or a result Mark can't return, gives `fallback`
    (default: ask for a re-run)."""
    result = _guarded(impl, input_, ctx)
    if result is not None:
        return result
    return fallback if fallback is not None else _internal_error()
