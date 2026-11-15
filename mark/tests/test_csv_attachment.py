import pytest
from opal_tms_sdk import ProxyChannelError

from _csv_package import strip_bom
from _platform import read_csv_attachment
from builders import an_attachment, csv_canvas, error, ok

CSV = "id,en-US\r\nL1,Hey\r\n"  # 18 bytes, the builder's default size_bytes
GERMAN = "id,de-DE\r\nL1,Gr\u00fc\u00dfe\r\n"  # 20 characters, 22 UTF-8 bytes
BOM = "\ufeff"  # 3 UTF-8 bytes


def _read(fake_tools, result, **attachment):
    fake_tools.respond("create_csv_canvas", result)
    return read_csv_attachment(an_attachment(**attachment), "Launch check")


def test_returns_the_text(fake_tools):
    assert _read(fake_tools, csv_canvas(CSV)) == {"status": "ok", "text": CSV}


def test_fetches_the_url_once(fake_tools):
    _read(fake_tools, csv_canvas(CSV))
    params = {"title": "Launch check", "csv_urls": ["gs://example-bucket/attachments/launch.csv"]}
    assert fake_tools.calls == [("create_csv_canvas", params)]


def test_measures_utf8_bytes(fake_tools):
    assert _read(fake_tools, csv_canvas(GERMAN), size_bytes=22)["text"] == GERMAN


def test_refuses_a_character_count(fake_tools):
    found = _read(fake_tools, csv_canvas(GERMAN), size_bytes=20)
    assert found == {"status": "incomplete", "text": None}


@pytest.mark.parametrize(
    ("result", "status"),
    [
        (csv_canvas(CSV + "x"), "incomplete"),
        (csv_canvas(CSV[:-1]), "incomplete"),
        (csv_canvas(CSV[:-4]), "incomplete"),
        (csv_canvas(CSV + "x\r\n"), "incomplete"),  # 3 bytes longer, ends with a newline
        (csv_canvas("id,en-US\r\nL1,Hey"), "incomplete"),  # 2 short, no newline
        (ok({"data": {"content": "id,en-US\r\nL1,Gr\udcfc\r\n"}}), "unreadable"),
        (csv_canvas("id,de-DE\r\nL1,Gr\ufffd\ufffde\r\n"), "not_utf8"),
        (csv_canvas("id,en-US\r\nL1,\ufffd\r\n"), "not_utf8"),  # 18 bytes: the size matches
        (csv_canvas("id,en-US\r\nL1," + "a" * 190 + "\ufffd" + "a" * 190 + "\r\n"), "not_utf8"),
        (ok({"data": {"content": None}}), "unavailable"),
        (ok({"data": "id,en-US"}), "unavailable"),
        (ok({"data": {"content": CSV}, "error": "tool failed"}), "unavailable"),
        (error(503), "unavailable"),
        (ProxyChannelError("down"), "unavailable"),
    ],
)
def test_tells_the_failures_apart(fake_tools, result, status):
    assert _read(fake_tools, result) == {"status": status, "text": None}


def test_keeps_a_bom_the_size_counts(fake_tools):
    assert _read(fake_tools, csv_canvas(BOM + CSV), size_bytes=21)["text"] == BOM + CSV


@pytest.mark.parametrize("text", [CSV, CSV.replace("\r\n", "\n")])
def test_accepts_a_bom_the_tool_dropped(fake_tools, text):
    size = len(text.encode("utf-8")) + 3  # 21 for CRLF lines, 19 for LF-only
    assert _read(fake_tools, csv_canvas(text), size_bytes=size) == {"status": "ok", "text": text}


def test_refuses_three_missing_bytes_without_a_final_newline(fake_tools):
    found = _read(fake_tools, csv_canvas("id,en-US\r\nL1,Hey"), size_bytes=19)
    assert found == {"status": "incomplete", "text": None}


def test_refuses_three_missing_bytes_when_the_text_has_a_bom(fake_tools):
    found = _read(fake_tools, csv_canvas(BOM + CSV), size_bytes=24)
    assert found == {"status": "incomplete", "text": None}


@pytest.mark.parametrize(
    "attachment",
    [
        an_attachment(filename="launch.txt"),
        an_attachment(filename=None),
        an_attachment(url="https://example.com/launch.csv"),
        an_attachment(url="gs://example-bucket/launch.csv?x=1"),
        an_attachment(url="gs://example-bucket/a b.csv"),
        an_attachment(url="gs://Example/launch.csv"),
        an_attachment(url="gs://example-bucket/launch.csv\n"),
        an_attachment(url=None),
        an_attachment(size_bytes="18"),
        an_attachment(size_bytes=True),
        an_attachment(size_bytes=18.0),
        an_attachment(size_bytes=0),
        an_attachment(size_bytes=65537),
        ["gs://example-bucket/launch.csv"],
        None,
    ],
)
def test_checks_the_shape_before_any_call(fake_tools, attachment):
    found = read_csv_attachment(attachment, "Launch check")
    assert found == {"status": "invalid_attachment", "text": None}
    assert fake_tools.calls == []


def test_accepts_the_file_cap_exactly(fake_tools):
    found = _read(fake_tools, csv_canvas("x" * 65536), filename="LAUNCH.CSV", size_bytes=65536)
    assert found == {"status": "ok", "text": "x" * 65536}


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        (BOM + CSV, CSV),
        (CSV, CSV),
        (BOM + BOM + CSV, BOM + CSV),
        ("a" + BOM, "a" + BOM),
        ("", ""),
        (None, None),
        (b"\xef\xbb\xbfid", b"\xef\xbb\xbfid"),
    ],
)
def test_strip_bom_removes_one_leading_bom_only_from_text(text, expected):
    assert strip_bom(text) == expected
