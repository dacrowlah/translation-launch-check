import json
import re
from pathlib import Path

import pytest

from _run_folder import RUN_ROOT, new_run_key, not_checked, read_run_file, write_run_file
from builders import RUN_DATA, RUN_DATA_CHECKSUM, RUN_KEY, a_failed_read, a_nested_list


def _dumps_ok(depth):
    try:
        json.dumps(a_nested_list(depth))
    except RecursionError:
        return False
    return True


def _deepest():
    """The deepest list json.dumps itself accepts (binary search, independent of our code)."""
    low, high = 1, 100_000
    while low < high:
        mid = (low + high + 1) // 2
        low, high = (mid, high) if _dumps_ok(mid) else (low, mid - 1)
    return low


def _store(root, name, stored):
    path = root / RUN_KEY / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(stored if isinstance(stored, bytes) else json.dumps(stored).encode())
    return path


def test_the_run_folder_is_the_projects_workspace_folder():
    assert RUN_ROOT == Path("/workspace/tlc")


def test_new_run_keys_are_16_random_hex():
    keys = {new_run_key() for _ in range(3)}
    assert len(keys) == 3
    assert all(re.fullmatch(r"[0-9a-f]{16}", key) for key in keys)


def test_write_stores_the_data_with_its_checksum(tmp_path):
    assert write_run_file(RUN_KEY, "package.json", RUN_DATA, root=tmp_path) == "ok"
    stored = (tmp_path / RUN_KEY / "package.json").read_bytes()
    expected = '{"checksum":"2511afa0ecfeac1e","data":{"n":1,"t":"Gr\u00fc\u00dfe"}}'
    assert stored == expected.encode("utf-8")


def test_read_returns_what_was_written(tmp_path):
    write_run_file(RUN_KEY, "reviews/es-419.json", RUN_DATA, root=tmp_path)
    found = read_run_file(RUN_KEY, "reviews/es-419.json", root=tmp_path)
    assert found == {"status": "ok", "data": RUN_DATA, "checksum": RUN_DATA_CHECKSUM}


def test_read_keeps_stored_null_data(tmp_path):
    write_run_file(RUN_KEY, "scores.json", None, root=tmp_path)
    assert read_run_file(RUN_KEY, "scores.json", root=tmp_path)["status"] == "ok"


@pytest.mark.parametrize(
    "name",
    ["rules.json", "reviews/de-DE.json", "reviews/zh-Hant-TW.json", "reviews/fil-PH.json"],
)
def test_accepts_the_documented_file_names(tmp_path, name):
    assert write_run_file(RUN_KEY, name, RUN_DATA, root=tmp_path) == "ok"


@pytest.mark.parametrize(
    "key",
    ["0123456789ABCDEF", "0123456789abcde", "0123456789abcdef0", RUN_KEY + "\n", "../etc", None, 7],
)
def test_write_refuses_a_bad_run_key_and_touches_nothing(tmp_path, key):
    assert write_run_file(key, "rules.json", RUN_DATA, root=tmp_path) == "invalid_path"
    assert list(tmp_path.iterdir()) == []


@pytest.mark.parametrize(
    "name",
    [
        "../rules.json",
        "/rules.json",
        "rules.txt",
        "Rules.json",
        "rules.json\n",
        "reviews/de-de.json",
        "reviews/ca-ES-valencia.json",
        "reviews/de-DE/../x.json",
        "a/b/c.json",
        None,
    ],
)
def test_write_refuses_a_bad_file_name_and_touches_nothing(tmp_path, name):
    assert write_run_file(RUN_KEY, name, RUN_DATA, root=tmp_path) == "invalid_path"
    assert list(tmp_path.iterdir()) == []


@pytest.mark.parametrize(
    "data",
    [{1: "a"}, {"a": float("nan")}, {"a": float("-inf")}, {"a": (1, 2)}, {"t": "\ud800"}],
)
def test_write_refuses_data_that_would_not_read_back_and_touches_nothing(tmp_path, data):
    assert write_run_file(RUN_KEY, "rules.json", data, root=tmp_path) == "invalid_data"
    assert list(tmp_path.iterdir()) == []


def test_write_reports_a_storage_failure_as_unavailable(tmp_path):
    root = tmp_path / "a-file"
    root.write_text("not a folder")
    assert write_run_file(RUN_KEY, "rules.json", RUN_DATA, root=root) == "unavailable"


@pytest.mark.parametrize(
    "stored",
    [
        b"",
        b"{not json",
        b"\xff\xfe",
        b"[" * 100_000,
        ["data", "checksum"],
        {"data": RUN_DATA},
        {"data": RUN_DATA, "checksum": None},
        b'{"data": 1e400, "checksum": null}',
        b'{"data": NaN, "checksum": "74234e98afe7498f"}',
        {"data": RUN_DATA, "checksum": "0000000000000000"},
        {"data": {"t": "changed", "n": 1}, "checksum": RUN_DATA_CHECKSUM},
    ],
)
def test_read_is_not_checked_for_a_broken_or_changed_file(tmp_path, stored):
    _store(tmp_path, "rules.json", stored)
    assert read_run_file(RUN_KEY, "rules.json", root=tmp_path) == a_failed_read()


def test_read_is_not_checked_for_a_missing_file_or_a_folder(tmp_path):
    (tmp_path / RUN_KEY / "rules.json").mkdir(parents=True)
    assert read_run_file(RUN_KEY, "rules.json", root=tmp_path) == a_failed_read()
    assert read_run_file(RUN_KEY, "scores.json", root=tmp_path) == a_failed_read()


@pytest.mark.parametrize(("key", "name"), [("0123", "rules.json"), (RUN_KEY, "../rules.json")])
def test_read_reports_a_bad_path_as_invalid_path(tmp_path, key, name):
    found = read_run_file(key, name, root=tmp_path)
    assert found == a_failed_read("invalid_path")


def test_not_checked_is_fresh_each_time():
    first = not_checked()
    first["status"] = "ok"
    assert not_checked() == a_failed_read()


def test_read_results_are_fresh_each_time(tmp_path):
    read_run_file(RUN_KEY, "rules.json", root=tmp_path)["status"] = "ok"
    assert read_run_file(RUN_KEY, "rules.json", root=tmp_path) == a_failed_read()


def test_write_around_the_depth_limit_never_raises_or_half_writes(tmp_path):
    deepest, results = _deepest(), []
    for depth in range(deepest - 6, deepest + 3):
        root = tmp_path / str(depth)
        result = write_run_file(RUN_KEY, "rules.json", a_nested_list(depth), root=root)
        assert result == "ok" or (result == "invalid_data" and not root.exists())
        results.append(result)
    assert set(results) == {"ok", "invalid_data"}


def test_one_run_holds_several_files(tmp_path):
    names = ["package.json", "rules.json", "reviews/de-DE.json", "reviews/fr-FR.json"]
    assert [write_run_file(RUN_KEY, name, RUN_DATA, root=tmp_path) for name in names] == ["ok"] * 4
    found = [read_run_file(RUN_KEY, name, root=tmp_path)["status"] for name in names]
    assert found == ["ok"] * 4


def test_ok_reads_are_fresh_each_time(tmp_path):
    write_run_file(RUN_KEY, "rules.json", {"n": 1}, root=tmp_path)
    first = read_run_file(RUN_KEY, "rules.json", root=tmp_path)
    first["data"]["n"] = 2
    first["checksum"] = "x"
    found = read_run_file(RUN_KEY, "rules.json", root=tmp_path)
    assert found == {"status": "ok", "data": {"n": 1}, "checksum": "2bfd14f43d17fc7c"}
