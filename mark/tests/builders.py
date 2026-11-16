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
EXAMPLE_WEBHOOK = "Translation Launch Check webhook"  # the example's webhook_trigger_name

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


METRIC_KEYS = (
    "save_time",
    "setup_start",
    "llm_call_time",
    "model_init_time",
    "tool_call_count",
    "tool_setup_time",
    "memory_setup_time",
    "prompt_process_time",
    "tool_execution_time",
    "final_db_update_time",
    "initial_db_save_time",
)


def an_execution_record(response):
    """An agent step's whole execution record, with the keys observed in a live run's step
    parameters (values made up): what the orchestrator sometimes passes for its output."""
    metrics = {key: 0.5 for key in METRIC_KEYS}
    usage = {"input_tokens": 1200, "output_tokens": 300}
    return {"metrics": metrics, "response": response, "token_usage": usage}


# The reserved route prefix split by an invisible character (a zero-width space, a soft
# hyphen), and what it must come out as once those are dropped: defused.
HIDDEN_PREFIXES = {
    "tlc\u200b_route_fix": "tlc-route-fix",
    "TLC_\u00adROUTE_needs_info": "tlc-route-needs_info",
}
FILE_LINK = "https://files.example.test/v1/file/F1?download=true"


def a_written_file(link=FILE_LINK, error=None):
    """write_content_to_file's envelope as verified from a code step (placeholder ids): the
    result sits under file_metadata, not data."""
    names = {"file_id": "F1", "name": "Campaign - corrected - abc123.csv", "mime_type": "text/csv"}
    where = {"size": 120, "uri": "gs://bucket/F1", "link": "https://files.example.test/v1/file/F1"}
    meta = {**names, **where, "download_link": link, "customer_id": "C1", "metadata": {}}
    return ok({"success": True, "file_metadata": meta, "error": error})


def tool_body(status="ok", **fields):
    """Our own tool's response body: a top-level status token, plus fields."""
    return {"status": status, **fields}


def helper_modules():
    """The helper modules the build inlines: every code_steps/_*.py."""
    return sorted(CODE_STEPS.glob("_*.py"))


def a_module_file(folder, name, lines):
    """A Python source file written from lines, for the import and name-clash checks."""
    path = folder / name
    path.write_text("\n".join([*lines, ""]), encoding="utf-8")
    return path


AGENTS_DIR = MARK_DIR / "agents"
REVIEW_DIR = AGENTS_DIR / "translation_review"
FIX_DIR = AGENTS_DIR / "translation_fix_suggestions"
SKILLS_DIR = MARK_DIR / "skills"
RULES_FILE = MARK_DIR.parent / "tool" / "config" / "rules.json"
_JSON_TYPES = {"object": dict, "array": list, "string": str, "boolean": bool}


def schema_errors(value, schema, path="$"):
    """Where a value breaks an output schema, as "<path>: <problem>" lines; [] when it fits.
    Covers the keywords our agent schemas use: type, properties, required,
    additionalProperties false, items, enum, maxItems and maxLength."""
    kind = schema["type"]
    if not isinstance(value, _JSON_TYPES[kind]):
        return [f"{path}: expected {kind}"]
    if "enum" in schema and value not in schema["enum"]:
        return [f"{path}: {value!r} not in enum"]
    if isinstance(value, list | str) and len(value) > _max_size(schema):
        return [f"{path}: longer than the schema allows"]
    if kind == "array":
        return _array_errors(value, schema["items"], path)
    return _object_errors(value, schema, path) if kind == "object" else []


def _max_size(schema):
    return schema.get("maxItems", schema.get("maxLength", float("inf")))


def _array_errors(items, item_schema, path):
    found = (schema_errors(item, item_schema, f"{path}[{i}]") for i, item in enumerate(items))
    return [error for errors in found for error in errors]


def _object_errors(value, schema, path):
    props = schema["properties"]
    missing = [f"{path}: missing {key}" for key in schema["required"] if key not in value]
    extra = [f"{path}: unexpected {key}" for key in value if key not in props]
    found = (
        schema_errors(value[key], props[key], f"{path}.{key}") for key in props if key in value
    )
    return missing + extra + [error for errors in found for error in errors]
