"""A real build reads exactly mark/local.config.json: never the example, never TLC_CONFIG.
Missing or incomplete, it stops with a message that names no value."""

import json

import pytest

import build
from _build.workflow import WorkflowError, assemble
from builders import AGENTS_DIR, CODE_STEPS, EXAMPLE_ALLOWED, EXAMPLE_CONFIG, MARK_DIR

REAL = {
    "allow_list": {"addresses": ["qa@team.test"], "domains": []},
    "qa_inbox": "qa@team.test",
    "template_url": "https://team.test/template.csv",
}


def a_mark_dir(tmp_path, values=None):
    """A mark folder with the example config and, unless values is None, a local one."""
    (tmp_path / "local.config.example.json").write_text(
        EXAMPLE_CONFIG.read_text(encoding="utf-8"), encoding="utf-8"
    )
    if values is not None:
        (tmp_path / "local.config.json").write_text(json.dumps(values), encoding="utf-8")
    return tmp_path


def test_a_real_build_reads_the_local_config_whatever_tlc_config_says(tmp_path, monkeypatch):
    monkeypatch.setenv("TLC_CONFIG", str(EXAMPLE_CONFIG))
    private = build.config_values(False, a_mark_dir(tmp_path, REAL))["PRIVATE"]
    assert private == {**REAL, "webhook_trigger_name": None}


def test_without_a_local_config_a_real_build_stops(tmp_path):
    with pytest.raises(
        build.BuildError, match="local.config.json is missing: copy local.config.example.json"
    ):
        build.config_values(False, a_mark_dir(tmp_path))


@pytest.mark.parametrize(
    ("values", "reason"),
    [
        ({"tool_token": "secret-token"}, "incomplete: 'allow_list'"),
        (
            {**REAL, "qa_inbox": "secret@elsewhere.test"},
            "incomplete: local config: qa_inbox must be",
        ),
    ],
)
def test_an_incomplete_local_config_stops_the_build_naming_no_value(tmp_path, values, reason):
    with pytest.raises(build.BuildError, match=reason) as raised:
        build.config_values(False, a_mark_dir(tmp_path, values))
    assert "secret" not in str(raised.value)


def test_a_non_finite_number_in_the_config_stops_the_build(tmp_path):
    values = {**REAL, "allow_list": {**REAL["allow_list"], "note": float("nan")}}
    with pytest.raises(build.BuildError, match="isn't plain JSON"):
        build.config_values(False, a_mark_dir(tmp_path, values))


def test_one_process_can_build_real_then_example_without_carrying_values(tmp_path):
    folder = a_mark_dir(tmp_path, REAL)
    assert build.config_values(False, folder)["PRIVATE"]["qa_inbox"] == REAL["qa_inbox"]
    assert build.config_values(True, folder)["PRIVATE"]["qa_inbox"] == EXAMPLE_ALLOWED


def test_example_builds_use_the_example_config(tmp_path):
    private = build.config_values(True, a_mark_dir(tmp_path, REAL))["PRIVATE"]
    assert private["qa_inbox"] == EXAMPLE_ALLOWED


def test_the_cli_reports_a_stopped_build_on_stderr_with_exit_2(monkeypatch, capsys):
    def stopped(example):
        raise build.BuildError("local.config.json is missing")

    monkeypatch.setattr(build, "config_values", stopped)
    assert build.main([]) == 2 and capsys.readouterr() == (
        "",
        "build: local.config.json is missing\n",
    )


def assembled_with(private):
    source = json.loads((MARK_DIR / "workflow" / "workflow.json").read_text(encoding="utf-8"))
    config = {
        "RULES": build.config_values(True)["RULES"],
        "PRIVATE": private,
        "CEILINGS": build.ceilings(),
    }
    return assemble(source, {"steps": CODE_STEPS, "agents": AGENTS_DIR}, config)


@pytest.mark.parametrize("name", [None, "Translation Launch Check webhook"])
def test_the_webhook_trigger_name_matches_the_config_when_it_names_one(name):
    assert (
        assembled_with({**REAL, "webhook_trigger_name": name})["agent_id"]
        == "translation_launch_check"
    )


def test_a_webhook_trigger_named_otherwise_than_the_config_is_refused():
    with pytest.raises(
        WorkflowError, match="the webhook trigger's name differs from webhook_trigger_name"
    ):
        assembled_with({**REAL, "webhook_trigger_name": "TLC hook"})
