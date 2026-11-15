import importlib
import inspect
import json
import os

import pytest

import _config
from _config import PRIVATE, RULES
from builders import EXAMPLE_ALLOWED, EXAMPLE_CONFIG, MARK_DIR

STEP_VALUES = {
    "allow_list": {"addresses": ["me@x.test"], "domains": ["x.test"]},
    "qa_inbox": "me@x.test",
    "template_url": "https://x.test/template.csv",
}


def _point_config_at(tmp_path, monkeypatch, values):
    monkeypatch.setenv("TLC_CONFIG", str(_write(tmp_path / "c.json", values)))


def _private_error(tmp_path, monkeypatch, change):
    """The ValueError text _private raises for STEP_VALUES with `change` applied."""
    _point_config_at(tmp_path, monkeypatch, {**STEP_VALUES, **change})
    with pytest.raises(ValueError) as raised:
        _config._private()
    return str(raised.value)


def _write(path, values):
    path.write_text(json.dumps(values), encoding="utf-8")
    return path


@pytest.fixture
def reload_config():
    """Reloads _config with TLC_CONFIG set to a path; always restores the env and the module."""
    saved = os.environ["TLC_CONFIG"]  # set by conftest

    def reload_with(path):
        os.environ["TLC_CONFIG"] = str(path)
        importlib.reload(_config)

    try:
        yield reload_with
    finally:
        os.environ["TLC_CONFIG"] = saved
        importlib.reload(_config)


def test_rules_hold_exactly_the_keys_steps_use():
    assert set(RULES) == {"limits", "master_locale", "locales", "locale_aliases", "channels"}


def test_rules_come_from_the_tools_rules_file():
    assert RULES["locales"]["ja-JP"]["language"] == "ja"


def test_private_holds_exactly_the_keys_steps_use():
    assert set(PRIVATE) == {"allow_list", "qa_inbox", "template_url"}


def test_tests_read_the_example_file():
    assert PRIVATE["qa_inbox"] == EXAMPLE_ALLOWED


def test_private_leaves_out_script_only_sections(tmp_path, monkeypatch):
    values = {**STEP_VALUES, "scripts": {"webhook": {"auth_key": "k"}}, "tool_token": "t"}
    _point_config_at(tmp_path, monkeypatch, values)
    assert _config._private() == STEP_VALUES


def test_private_reads_local_config_when_tlc_config_is_unset(tmp_path, monkeypatch):
    monkeypatch.delenv("TLC_CONFIG", raising=False)
    _write(tmp_path / "local.config.json", STEP_VALUES)
    _write(tmp_path / "local.config.example.json", {**STEP_VALUES, "qa_inbox": "ex@x.test"})
    assert _config._private(tmp_path)["qa_inbox"] == "me@x.test"


def test_private_reads_local_config_when_tlc_config_is_empty(tmp_path, monkeypatch):
    monkeypatch.setenv("TLC_CONFIG", "")
    _write(tmp_path / "local.config.json", STEP_VALUES)
    assert _config._private(tmp_path)["qa_inbox"] == "me@x.test"


def test_private_defaults_to_the_mark_folder():
    default = inspect.signature(_config._private).parameters["mark_dir"].default
    assert default == MARK_DIR


def test_private_falls_back_to_the_example_file(tmp_path, monkeypatch):
    monkeypatch.delenv("TLC_CONFIG", raising=False)
    _write(tmp_path / "local.config.example.json", {**STEP_VALUES, "qa_inbox": "ex@x.test"})
    assert _config._private(tmp_path)["qa_inbox"] == "ex@x.test"


def test_tlc_config_wins_over_local_config(tmp_path, monkeypatch):
    named = _write(tmp_path / "named.json", {**STEP_VALUES, "qa_inbox": "named@x.test"})
    monkeypatch.setenv("TLC_CONFIG", str(named))
    _write(tmp_path / "local.config.json", STEP_VALUES)
    assert _config._private(tmp_path)["qa_inbox"] == "named@x.test"


def test_a_missing_required_key_raises(tmp_path, monkeypatch):
    values = {key: value for key, value in STEP_VALUES.items() if key != "qa_inbox"}
    _point_config_at(tmp_path, monkeypatch, values)
    with pytest.raises(KeyError, match="qa_inbox"):
        _config._private()


def test_import_fails_loudly_without_a_required_key(tmp_path, reload_config):
    values = {key: value for key, value in STEP_VALUES.items() if key != "template_url"}
    with pytest.raises(KeyError, match="template_url"):
        reload_config(_write(tmp_path / "c.json", values))


def test_import_reads_the_named_file(tmp_path, reload_config):
    reload_config(_write(tmp_path / "c.json", STEP_VALUES))
    assert _config.PRIVATE == STEP_VALUES


def test_example_file_keeps_script_values_out_of_step_keys():
    example = json.loads(EXAMPLE_CONFIG.read_text(encoding="utf-8"))
    assert set(example) == {"_comment", "allow_list", "qa_inbox", "template_url", "scripts"}
    assert set(example["scripts"]) == {"webhook"}


GOOD = STEP_VALUES["allow_list"]
BAD_SHAPES = [
    ({"allow_list": {"addresses": "me@x.test", "domains": []}}, "allow_list"),
    ({"allow_list": {"addresses": ["me@x.test"]}}, "allow_list"),
    ({"allow_list": {"domains": ["x.test"]}}, "allow_list"),
    ({"allow_list": ["me@x.test"]}, "allow_list"),
    ({"allow_list": {**GOOD, "addresses": ["me@x.test", ""]}}, "allow_list"),
    ({"allow_list": {**GOOD, "addresses": ["me@x.test", 7]}}, "allow_list"),
    ({"allow_list": {**GOOD, "addresses": ["me@x.test", "Me <me@x.test>"]}}, "allow_list"),
    ({"allow_list": {**GOOD, "addresses": ["me@x.test", "me@x.test "]}}, "allow_list"),
    ({"allow_list": {**GOOD, "addresses": ["me@x.test", "@x.test"]}}, "allow_list"),
    ({"allow_list": {**GOOD, "domains": ["x.test", ".x.test"]}}, "allow_list"),
    ({"allow_list": {**GOOD, "domains": ["x.test", "me@x.test"]}}, "allow_list"),
    ({"allow_list": {**GOOD, "domains": ["x.test", "test"]}}, "allow_list"),
    ({"allow_list": {**GOOD, "domains": ["x.test", "\u212ax.test"]}}, "allow_list"),
    ({"qa_inbox": ["me@x.test"]}, "qa_inbox"),
    ({"qa_inbox": ""}, "qa_inbox"),
    ({"qa_inbox": "me@other.test"}, "qa_inbox"),
    ({"qa_inbox": "not an address"}, "qa_inbox"),
    ({"template_url": 5}, "template_url"),
    ({"template_url": "http://x.test/template.csv"}, "template_url"),
]


@pytest.mark.parametrize(("change", "field"), BAD_SHAPES)
def test_a_wrong_private_shape_raises_for_that_field(tmp_path, monkeypatch, change, field):
    assert _private_error(tmp_path, monkeypatch, change).startswith(f"local config: {field} ")


@pytest.mark.parametrize(
    "change",
    [
        {"allow_list": {"addresses": ["me@x.test", "secret <me@x.test>"], "domains": []}},
        {"qa_inbox": "secret@other.test"},
        {"template_url": "http://secret.test/t.csv"},
    ],
)
def test_a_wrong_private_shape_names_no_value(tmp_path, monkeypatch, change):
    assert "secret" not in _private_error(tmp_path, monkeypatch, change)


@pytest.mark.parametrize(
    ("change", "text"),
    [
        (
            {"allow_list": ["me@x.test"]},
            "local config: allow_list needs lists of valid addresses and bare domains",
        ),
        (
            {"qa_inbox": "me@other.test"},
            "local config: qa_inbox must be a valid address on the allow_list",
        ),
        (
            {"template_url": "http://x.test/t.csv"},
            "local config: template_url must be an https URL",
        ),
    ],
)
def test_each_private_problem_has_its_exact_message(tmp_path, monkeypatch, change, text):
    assert _private_error(tmp_path, monkeypatch, change) == text
