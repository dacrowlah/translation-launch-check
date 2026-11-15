"""Shared test data: tool results and trigger data as the platform returns them (verified
2026-11), the example config's values, and run-folder fixtures."""

from pathlib import Path

# Standard library only: conftest imports this module before it puts code_steps and the
# fakes on sys.path.
MARK_DIR = Path(__file__).resolve().parents[1]
CODE_STEPS = MARK_DIR / "code_steps"
EXAMPLE_CONFIG = MARK_DIR / "local.config.example.json"
EXAMPLE_ALLOWED = "owner@example.com"  # the example's allow-listed address, also its qa_inbox
EXAMPLE_DOMAIN = "example.org"  # the example's allow-listed domain

RUN_KEY = "0123456789abcdef"
RUN_DATA = {"t": "Gr\u00fc\u00dfe", "n": 1}
RUN_DATA_CHECKSUM = "2511afa0ecfeac1e"  # first 16 hex of SHA-256 of {"n":1,"t":"Gr...e"}
LOCALE_LINES = [{"id": "L1", "master": "Hi", "text": "Hallo"}]
LOCALE_CHECKSUM = "d105065e1368987a"  # locale_checksum("de-DE", LOCALE_LINES, []): test_checksum


def a_failed_read(status="not_checked"):
    """A run-folder read that failed: no data, no checksum."""
    return {"status": status, "data": None, "checksum": None}


def a_nested_list(depth):
    """[[[...]]] nested `depth` times, to reach the JSON serializer's depth limit."""
    value = []
    for _ in range(depth):
        value = [value]
    return value


def ok(body):
    """A success envelope around the tool's response body."""
    return {"response_type": "application/json", "response": body}


def error(status):
    """The error envelope. A custom tool's HTTP failure carried status_code next to
    error_type and message; a failing system tool carried only the last two."""
    response = {"error_type": f"http_{status}", "message": "tool failed", "status_code": status}
    return {"response_type": "error", "response": response}


def json_error(status):
    """A failure inside a success envelope (seen once, from a CMP tool)."""
    return ok({"status_code": status, "detail": "tool failed"})


def tool_body(status="ok", **fields):
    """Our own tool's response body: a top-level status token, plus fields."""
    return {"status": status, **fields}


def csv_canvas(content):
    """create_csv_canvas's success: the fetched file's text in data.content."""
    return ok({"data": {"content": content, "size": len(content.encode("utf-8"))}})


def an_attachment(**overrides):
    """One entry of email_payload.attachments, as the email trigger records it."""
    base = {
        "url": "gs://example-bucket/attachments/launch.csv",
        "file_id": "file-1",
        "filename": "launch.csv",
        "size_bytes": 18,
        "size_mb": 0.0,
        "content_type": "text/csv",
    }
    return {**base, **overrides}


def helper_modules():
    """The helper modules the build inlines: every code_steps/_*.py."""
    return sorted(CODE_STEPS.glob("_*.py"))


def a_module_file(folder, name, lines):
    """A Python source file written from lines, for the import and name-clash checks."""
    path = folder / name
    path.write_text("\n".join([*lines, ""]), encoding="utf-8")
    return path
