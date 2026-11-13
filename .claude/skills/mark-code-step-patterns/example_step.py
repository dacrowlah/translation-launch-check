"""A Mark workflow code step that checks markets with a custom tool.

Shows every pattern in SKILL.md: run_safely, call_tool (response_type check), statuses not
exceptions, template-only user text, nothing printed, small functions.
In this repo the helpers marked SHARED live in mark/code_steps/_shared.py and are inlined
into each step by build.py (code steps cannot import local modules).
"""

import hashlib
import json

from opal_tms_sdk import tools

# --- SHARED ---------------------------------------------------------------------------


def call_tool(name: str, **params) -> dict:
    """Call a platform tool. Failures come back as data, never as exceptions."""
    result = getattr(tools, name)(**params)
    if not isinstance(result, dict) or result.get("response_type") == "error":
        return {"ok": False, "body": None}
    return {"ok": True, "body": result.get("response")}


def run_safely(impl, input: dict, ctx: dict) -> dict:
    """Never raise, never print: chat narrates stderr and failures to the end user."""
    try:
        return impl(input, ctx)
    except Exception:  # noqa: BLE001 - last-resort guard; the user gets a status
        return {"status": "internal_error", "message": TEMPLATES["internal_error"], "summary": "internal error"}


def facts_checksum(facts: dict) -> str:
    """Deterministic fingerprint so a later step can detect model re-typing."""
    canonical = json.dumps(facts, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()[:16]


# --- STEP -----------------------------------------------------------------------------

TEMPLATES = {
    "verified": "{code}: holidays verified.",
    "invalid": "{code} isn't a valid market code; please fix it in the brief.",
    "not_covered": "{code} can't be verified by this system (no holiday data source covers it).",
    "source_unavailable": "{code} couldn't be checked right now; please re-run before launch.",
    "unavailable": "Couldn't check the markets right now. Your brief wasn't the problem; please re-run in a few minutes.",
    "internal_error": "Something went wrong on our side. Please re-run the check.",
}


def line_for(code: str, status: str) -> str:
    return TEMPLATES.get(status, TEMPLATES["source_unavailable"]).format(code=code)


def statuses_by_code(body: dict) -> dict:
    return {m["country_code"]: m["status"] for m in body.get("markets", [])}


def normalize(raw: list) -> list:
    return [str(m).strip().upper() for m in raw]


def unavailable() -> dict:
    return {"status": "unavailable", "message": TEMPLATES["unavailable"], "summary": "check unavailable"}


def report(markets: list, status: dict) -> dict:
    lines = [line_for(code, status.get(code, "source_unavailable")) for code in markets]
    return {"status": "ok", "message": " ".join(lines), "markets": status, "summary": f"{len(markets)} markets checked"}


def check_markets(input: dict, ctx: dict) -> dict:
    markets = normalize(input.get("requested_markets", []))
    result = call_tool("markets_launch_check", markets=markets, launch_date=input["launch_date"])
    if not result["ok"]:
        return unavailable()
    return report(markets, statuses_by_code(result["body"]))


def handler(input: dict, ctx: dict) -> dict:
    return run_safely(check_markets, input, ctx)
