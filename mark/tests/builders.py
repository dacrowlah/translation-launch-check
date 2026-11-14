"""Shapes of tool results as the platform returns them (verified 2026-11-13)."""


def ok(body):
    return {"response_type": "application/json", "response": body}


def error(status):
    # status is accepted for call-site readability; the real error shape has no status_code.
    return {
        "response_type": "error",
        "response": {"error_type": f"http_{status}", "message": "tool failed"},
    }


def json_error(status):
    return {
        "response_type": "application/json",
        "response": {"status_code": status, "detail": "tool failed"},
    }
