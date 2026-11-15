import pytest
from opal_tms_sdk import ToolInvocationError, ToolValidationError

from _platform import create_canvas, send_email, write_file
from _shared import call_platform
from builders import EXAMPLE_ALLOWED, FILE_LINK, a_written_file, error, json_error, ok

ALLOWED = EXAMPLE_ALLOWED


def test_call_platform_returns_the_body(fake_tools):
    fake_tools.respond("get_today", ok({"date": "2026-11-12"}))
    assert call_platform("get_today") == {"date": "2026-11-12"}
    assert fake_tools.calls == [("get_today", {})]


def test_call_platform_passes_a_tool_parameter_called_tool(fake_tools):
    fake_tools.respond("create_canvas", ok({"artifact_url": "u"}))
    call_platform("create_canvas", tool="x", name="n")
    assert fake_tools.calls == [("create_canvas", {"tool": "x", "name": "n"})]


@pytest.mark.parametrize("result", [ok("2026-11-12"), ok(["2026-11-12"]), error(503)])
def test_call_platform_is_none_without_a_body_object(fake_tools, result):
    fake_tools.respond("get_today", result)
    assert call_platform("get_today") is None


def test_send_email_counts_only_sent(fake_tools):
    fake_tools.respond("send_email", ok({"status": "sent", "message_id": "m-1"}))
    assert send_email(ALLOWED, "Subject", "Body") is True


def test_send_email_sends_a_non_ascii_subject(fake_tools):
    fake_tools.respond("send_email", ok({"status": "sent"}))
    assert send_email(ALLOWED, "Gr\u00fc\u00dfe \u2014 Launch", "Body") is True


def test_send_email_passes_recipient_subject_and_body(fake_tools):
    fake_tools.respond("send_email", ok({"status": "sent"}))
    send_email(ALLOWED, "Subject", "Body\nmore")
    params = {"recipient_emails": ALLOWED, "subject": "Subject", "body": "Body\nmore"}
    assert fake_tools.calls == [("send_email", params)]


@pytest.mark.parametrize(
    "result",
    [
        ok({"status": "pending"}),
        ok({"message_id": "m-1"}),
        ok("sent"),
        error(500),
        {"response_type": "error", "response": {"status": "sent"}},
        ok({"status": "sent", "status_code": 500}),
        None,
        ToolInvocationError("failed"),
    ],
)
def test_send_email_is_false_for_anything_but_sent(fake_tools, result):
    fake_tools.respond("send_email", result)
    assert send_email(ALLOWED, "Subject", "Body") is False


@pytest.mark.parametrize(
    "recipient",
    ["attacker@evil.test", f"{ALLOWED}, attacker@evil.test", [ALLOWED], None],
)
def test_send_email_never_calls_for_a_recipient_off_the_list(fake_tools, recipient):
    fake_tools.respond("send_email", ok({"status": "sent"}))
    assert send_email(recipient, "Subject", "Body") is False
    assert fake_tools.calls == []


@pytest.mark.parametrize(
    "subject",
    [
        "Subject\r\nBcc: attacker@evil.test",
        "a\nb",
        "a\rb",
        "a\u2028b",
        "a\u2029b",
        "a\x85Bcc: x",
        "a\x0bb",
        "a\x0cb",
        "a\x1cb",
        "a\x00b",
        "a\x1bb",
        "a\tb",
        "a\x7fb",
        "Report \u202eTXT.exe",
        "a\u2066b",
        "a\u200eb",
        "a\u061cb",
        "a\u200bb",
        "a\ufeffb",
        "a\u00adb",
        "a\u200db",
        "a\ud800b",
        None,
    ],
)
def test_send_email_never_calls_with_a_subject_that_is_not_one_line(fake_tools, subject):
    fake_tools.respond("send_email", ok({"status": "sent"}))
    assert send_email(ALLOWED, subject, "Body") is False
    assert fake_tools.calls == []


def test_create_canvas_returns_the_artifact_url(fake_tools):
    fake_tools.respond("create_canvas", ok({"artifact_url": "https://example.com/a/1"}))
    assert create_canvas("Report 0123", "# Report") == "https://example.com/a/1"


# The envelope create_canvas really returned (verified from a code step; placeholder ids).
CANVAS_URL = "https://mark.example.test/instances/INSTANCE/artifacts?artifactId=A1&spaceId=S1"
CANVAS_DATA = {"id": "A1", "name": "Report 0123.md", "artifact_url": CANVAS_URL}
EMPTY = {"success": None, "type": None, "result": None, "file_contents": None}


def enveloped(data, error=None):
    return ok({**EMPTY, "data": data, "error": error})


def test_create_canvas_reads_the_url_under_data(fake_tools):
    fake_tools.respond("create_canvas", enveloped(CANVAS_DATA))
    assert create_canvas("Report 0123", "# Report") == CANVAS_URL


def test_a_platform_result_with_an_error_is_a_failure(fake_tools):
    fake_tools.respond("create_canvas", enveloped(CANVAS_DATA, error="canvas failed"))
    assert create_canvas("Report 0123", "# Report") is None
    fake_tools.respond("send_email", enveloped({"status": "sent"}, error="send failed"))
    assert send_email(ALLOWED, "Subject", "Body") is False


def test_send_email_reads_sent_under_data(fake_tools):
    fake_tools.respond("send_email", enveloped({"status": "sent"}))
    assert send_email(ALLOWED, "Subject", "Body") is True


def test_create_canvas_sends_markdown_by_name(fake_tools):
    fake_tools.respond("create_canvas", ok({"artifact_url": "u"}))
    create_canvas("Report 0123", "# Report")
    params = {"name": "Report 0123", "content": "# Report", "mime_type": "text/markdown"}
    assert fake_tools.calls == [("create_canvas", params)]


@pytest.mark.parametrize(
    "result",
    [
        ok({"artifact_url": None}),
        ok({"artifact_url": ["u"]}),
        ok({"artifact_url": ""}),
        ok({"artifact_url": "  "}),
        ok({}),
        ok(None),
        error(500),
        json_error(500),
        ok({"artifact_url": "u", "status_code": 502}),
        ToolValidationError("too large"),
    ],
)
def test_create_canvas_is_none_without_a_url(fake_tools, result):
    fake_tools.respond("create_canvas", result)
    assert create_canvas("Report 0123", "# Report") is None


def test_write_file_returns_the_download_link_from_file_metadata(fake_tools):
    fake_tools.respond("write_content_to_file", a_written_file())
    assert write_file("Report - corrected - abc123.csv", "id\r\n") == FILE_LINK
    params = {"content": "id\r\n", "filename": "Report - corrected - abc123.csv"}
    assert fake_tools.calls == [("write_content_to_file", params)]


@pytest.mark.parametrize(
    "result",
    [
        a_written_file(error="write failed"),
        a_written_file(link=None),
        a_written_file(link="http://files.example.test/v1/file/F1"),
        a_written_file(link="https://files.example.test/a b"),
        a_written_file(link="https://files.example.test/a)b"),
        ok({"success": True, "data": {"download_link": FILE_LINK}}),
        error(500),
    ],
)
def test_write_file_is_none_without_a_usable_link(fake_tools, result):
    fake_tools.respond("write_content_to_file", result)
    assert write_file("Report - corrected - abc123.csv", "id\r\n") is None
