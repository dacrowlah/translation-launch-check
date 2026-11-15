"""scripts/send_package.py: the webhook sender. Its payload passes "Read and check the file",
it sends nothing without a usable webhook config or for a file with problems, and it prints
the HTTP status only, never the webhook's address or key."""

import http.client
import http.server
import json
import threading
import urllib.error

import pytest
from send_package import (
    DEMO,
    NO_ANSWER,
    NO_WEBHOOK,
    main,
    post,
    read_package,
    webhook_payload,
)

from _config import RULES
from _webhook_package import from_webhook

ERRORS_CSV = str(DEMO / "black-friday-errors.csv")
HOOK = {"url": "https://hooks.example.com/tlc", "auth_header": "X-Api-Key", "auth_key": "k-123456"}


class Response:
    def __init__(self, status):
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


class RecordingOpener:
    """urlopen's stand-in: records each request, then answers a status or raises."""

    def __init__(self, answer=202):
        self.answer, self.requests = answer, []

    def __call__(self, request, timeout):
        self.requests.append((request, timeout))
        if isinstance(self.answer, Exception):
            raise self.answer
        return Response(self.answer)


class Redirecting(http.server.BaseHTTPRequestHandler):
    """POST /hook answers 302 to /elsewhere, which would answer 200; records each request."""

    seen = []

    def do_POST(self):  # noqa: N802 - the handler's method naming
        self.rfile.read(int(self.headers["Content-Length"]))
        self.seen.append(("POST", self.path, self.headers.get("X-Api-Key")))
        self.send_response(302)
        self.send_header("Location", "/elsewhere")
        self.end_headers()

    def do_GET(self):  # noqa: N802 - the handler's method naming
        self.seen.append(("GET", self.path, self.headers.get("X-Api-Key")))
        self.send_response(200)
        self.end_headers()

    def log_message(self, *_):
        """Silent: the test reads `seen`, not stderr."""


@pytest.fixture
def redirecting_server():
    Redirecting.seen = []
    server = http.server.HTTPServer(("127.0.0.1", 0), Redirecting)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_port}"
    server.shutdown()
    server.server_close()


def errors_package():
    return read_package(ERRORS_CSV, RULES)[0]


def a_config(tmp_path, content):
    path = tmp_path / "local.config.json"
    path.write_text(json.dumps(content), encoding="utf-8")
    return path


def send(tmp_path, opener, argv=(ERRORS_CSV,)):
    return main(
        list(argv), config_path=a_config(tmp_path, {"scripts": {"webhook": HOOK}}), opener=opener
    )


def test_the_payload_checksum_is_accepted_by_read_and_check():
    package = errors_package()
    assert from_webhook(webhook_payload(package), RULES) == (package, [])


def test_a_payload_changed_after_signing_is_refused():
    payload = webhook_payload(errors_package())
    payload["lines"][0]["texts"]["de-DE"] = "Black Friday: 30 % auf alle Jacken"
    assert from_webhook(payload, RULES)[1][0]["message"] == "The package changed in transit."


def test_a_send_prints_only_the_http_status(tmp_path, capsys):
    assert (send(tmp_path, RecordingOpener(202)), capsys.readouterr()) == (0, ("HTTP 202\n", ""))


def test_a_send_posts_the_payload_as_json_with_the_auth_header(tmp_path):
    opener = RecordingOpener(202)
    send(tmp_path, opener)
    [(request, timeout)] = opener.requests
    headers = (request.get_header("X-api-key"), request.get_header("Content-type"))
    sent = (request.get_method(), request.full_url, headers, timeout)
    body = json.loads(request.data.decode("utf-8"))
    assert (sent, body) == (
        ("POST", HOOK["url"], (HOOK["auth_key"], "application/json"), 30),
        webhook_payload(errors_package()),
    )


def test_an_http_error_status_is_printed_and_fails(tmp_path, capsys):
    error = urllib.error.HTTPError(HOOK["url"], 401, "Unauthorized", {}, None)
    assert (send(tmp_path, RecordingOpener(error)), capsys.readouterr()) == (2, ("HTTP 401\n", ""))


@pytest.mark.parametrize(
    "error",
    [
        urllib.error.URLError(f"cannot reach {HOOK['url']}"),
        TimeoutError("timed out"),
        http.client.RemoteDisconnected("Remote end closed connection without response"),
    ],
)
def test_no_answer_is_one_line_that_names_no_webhook(tmp_path, capsys, error):
    code = send(tmp_path, RecordingOpener(error))
    assert (code, capsys.readouterr()) == (2, (NO_ANSWER + "\n", ""))


def test_a_redirect_is_reported_as_its_status_and_never_followed(redirecting_server):
    hook = {**HOOK, "url": f"{redirecting_server}/hook"}
    status = post(webhook_payload(errors_package()), hook)
    assert (status, Redirecting.seen) == (302, [("POST", "/hook", HOOK["auth_key"])])


@pytest.mark.parametrize(
    "content",
    [
        None,  # no private config file at all
        {"tool_token": "t" * 40},  # a config without the webhook section
        {"scripts": {"webhook": {**HOOK, "auth_key": "replace-me"}}},  # the example placeholder
        {"scripts": {"webhook": {**HOOK, "url": "http://hooks.example.com/tlc"}}},
        {"scripts": {"webhook": {**HOOK, "auth_header": " "}}},
        {"scripts": {"webhook": {"url": HOOK["url"]}}},
        {"scripts": ["webhook"]},
    ],
)
def test_without_a_usable_webhook_config_nothing_is_sent(tmp_path, capsys, content):
    path = tmp_path / "missing.json" if content is None else a_config(tmp_path, content)
    opener = RecordingOpener()
    code = main([ERRORS_CSV], config_path=path, opener=opener)
    assert (code, capsys.readouterr(), opener.requests) == (2, (NO_WEBHOOK + "\n", ""), [])


def test_a_file_with_problems_lists_them_and_sends_nothing(tmp_path, capsys):
    opener = RecordingOpener()
    code = send(tmp_path, opener, [str(DEMO / "black-friday-broken.csv")])
    assert (code, capsys.readouterr().out.splitlines(), opener.requests) == (
        1,
        [
            "header: Column jp isn't a supported locale. Did you mean ja-JP?",
            "row 5: L4 has no fr-FR text. Fill in every cell, or delete the row.",
            "row 7: The id L5 is used more than once. Give every row a unique id.",
        ],
        [],
    )


def test_a_dry_run_prints_the_payload_and_sends_nothing(tmp_path, capsys):
    opener = RecordingOpener()
    code = send(tmp_path, opener, [ERRORS_CSV, "--dry-run"])
    printed = json.loads(capsys.readouterr().out)
    assert (code, printed, opener.requests) == (0, webhook_payload(errors_package()), [])
