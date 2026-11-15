"""The built code steps as Mark will run them: one file each, valid Python with a handler,
no local imports, no print, only allow-listed imports, and working end to end on the fake
SDK. Also the CLI, and that a real private value never reaches a tracked file."""

import ast
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest

import build
from builders import EXAMPLE_ALLOWED, EXAMPLE_CONFIG, MARK_DIR, ok
from step_builders import a_package, a_review, a_tool_report, a_webhook_input, ok_body
from test_import_graph import ALLOWED_STDLIB, PLATFORM_PACKAGES, imported_modules

STEPS = ("read_and_check", "save_review", "score", "report", "needs_info")


@pytest.fixture(scope="module")
def built(tmp_path_factory):
    """{step file stem: built code} from the example build, through the CLI."""
    out = tmp_path_factory.mktemp("dist")
    assert build.main(["--example", "--out", str(out)]) == 0
    workflow = json.loads((out / build.WORKFLOW_FILE).read_text(encoding="utf-8"))
    steps = [s for top in workflow["steps"] for s in [top, *top.get("child_steps", [])]]
    return {
        s["code"].split("mark/code_steps/")[1].split(".py")[0]: s["code"]
        for s in steps
        if s["step_type"] == "code"
    }


def test_the_cli_writes_the_workflow_and_both_skills(tmp_path):
    build.main(["--example", "--out", str(tmp_path)])
    found = sorted(str(p.relative_to(tmp_path)) for p in tmp_path.rglob("*.json"))
    assert found == [
        "skills/market-rules-glossary.json",
        "skills/translation-fix-playbook.json",
        "translation_launch_check.json",
    ]


def test_every_step_is_built_and_compiles_with_a_handler(built):
    assert sorted(built) == sorted(STEPS)
    for code in built.values():
        tree = ast.parse(code)
        assert "handler" in {n.name for n in tree.body if isinstance(n, ast.FunctionDef)}


def imports(code, folder):
    """The top-level modules the built code imports, read by test_import_graph's own reader."""
    path = folder / "built.py"
    path.write_text(code, encoding="utf-8")
    return imported_modules(path)


def test_built_steps_import_only_the_allow_listed_library_and_the_sdk(built, tmp_path):
    allowed = ALLOWED_STDLIB | PLATFORM_PACKAGES
    found = {stem: imports(code, tmp_path) - allowed for stem, code in built.items()}
    assert found == {stem: set() for stem in STEPS}


def test_built_steps_print_nothing_and_import_nothing_local(built, tmp_path):
    for code in built.values():
        calls = [n for n in ast.walk(ast.parse(code)) if isinstance(n, ast.Call)]
        assert not any(getattr(c.func, "id", None) == "print" for c in calls)
        assert not any(name.startswith("_") for name in imports(code, tmp_path))


def test_the_example_build_injects_the_example_config(built):
    assert (
        f"'qa_inbox': '{EXAMPLE_ALLOWED}'" in built["report"] and "import os" not in built["report"]
    )


def string_values(value):
    if isinstance(value, dict):
        return [s for v in value.values() for s in string_values(v)]
    return (
        [s for v in value for s in string_values(v)]
        if isinstance(value, list)
        else [value]
        if isinstance(value, str)
        else []
    )


SKIPPED_DIRS = {".git", ".venv", "node_modules", "dist", "__pycache__", ".preflight"}


def _walked(root):
    """Every file under root outside generated and ignored folders, minus local.config.json:
    the stand-in for git's list in a copy that isn't a repository (prove-gates' scratch)."""
    files = (p for p in root.rglob("*") if p.is_file() and not SKIPPED_DIRS & set(p.parts))
    return [str(p.relative_to(root)) for p in files if p.name != "local.config.json"]


def tracked_files():
    """Every file git tracks in this repository, or every source file when this copy is not a
    repository (git with fixed arguments: S603/S607)."""
    git = ["git", "ls-files", "-z"]
    listed = subprocess.run(git, cwd=MARK_DIR.parent, capture_output=True, check=False)  # noqa: S603, S607
    names = [name for name in listed.stdout.decode().split("\0") if name]
    return names if listed.returncode == 0 else _walked(MARK_DIR.parent)


def real_values():
    """String values of mark/local.config.json, if it exists, other than the example's."""
    local = MARK_DIR / "local.config.json"
    example = set(string_values(json.loads(EXAMPLE_CONFIG.read_text(encoding="utf-8"))))
    return (
        set(string_values(json.loads(local.read_text(encoding="utf-8")))) - example
        if local.is_file()
        else set()
    )


def test_real_private_values_never_reach_a_tracked_file():
    names = tracked_files()
    assert "mark/local.config.json" not in names and not any(
        n.startswith("mark/dist/") for n in names
    )
    texts = [
        (MARK_DIR.parent / name).read_bytes()
        for name in names
        if (MARK_DIR.parent / name).is_file()
    ]
    assert [value for value in real_values() if any(value.encode() in text for text in texts)] == []


def run_built(code, input_, ctx):
    namespace = {}
    exec(compile(code, "built step", "exec"), namespace)  # noqa: S102 - our own built step
    return namespace["handler"](input_, ctx)


def a_built_ctx(tmp_path):
    folders = {"input_dir": str(tmp_path / "in"), "output_dir": str(tmp_path / "out")}
    return {**folders, "run_root": str(tmp_path / "tlc")}


def save_input(checked):
    item = checked["locales"][0]
    keys = {"run_key": checked["run_key"], "locale": item["locale"], "checksum": item["checksum"]}
    return {**keys, "review": a_review(item), "back_translation": "[L1] Up to 30%"}


def scored_by_built_steps(built, fake_tools, ctx):
    """Read and check, Save the review and Score, all as built, on one clean language."""
    fake_tools.respond("localization_check", ok_body(a_tool_report(a_package())))
    checked = run_built(built["read_and_check"], a_webhook_input(a_package()), ctx)
    assert run_built(built["save_review"], save_input(checked), ctx)["saved"] is True
    keys = {"run_key": checked["run_key"], "check_checksum": checked["check_checksum"]}
    return run_built(built["score"], keys, ctx)


def reported_by_built_step(built, fake_tools, ctx, scored):
    fake_tools.respond("create_canvas", ok({"artifact_url": "https://canvas.example.test/c/1"}))
    fake_tools.respond("send_email", ok({"status": "sent"}))
    keys = {"run_key": scored["run_key"], "verdict_checksum": scored["verdict_checksum"]}
    return run_built(built["report"], keys, ctx)


def test_the_built_steps_run_end_to_end_in_silence(built, fake_tools, tmp_path, capsys):
    ctx = a_built_ctx(tmp_path)
    scored = scored_by_built_steps(built, fake_tools, ctx)
    report = reported_by_built_step(built, fake_tools, ctx, scored)
    assert (scored["route"], report["outcome"], report["emailed"]) == (
        "tlc_route_report",
        "ready",
        True,
    )
    assert capsys.readouterr() == ("", "")


def test_the_built_needs_info_step_answers(built):
    out = run_built(
        built["needs_info"],
        {"problems": [{"where": "row 2", "message": "L1 has no de-DE text.", "suggestion": ""}]},
        {},
    )
    assert out["message"].splitlines()[:2] == [
        "Your file needs a few changes before it can be checked:",
        "- row 2: L1 has no de-DE text.",
    ]


def test_example_builds_from_the_example_config_whatever_tlc_config_says(tmp_path):
    """As preflight runs it: a fresh interpreter, a broken TLC_CONFIG that --example overrides."""
    (tmp_path / "broken.json").write_text("{}", encoding="utf-8")
    env = {"TLC_CONFIG": str(tmp_path / "broken.json"), "PATH": "/usr/bin:/bin"}
    args = [sys.executable, str(MARK_DIR / "build.py"), "--example", "--out", str(tmp_path / "out")]
    done = subprocess.run(args, capture_output=True, text=True, env=env)  # noqa: S603 - our build
    assert done.returncode == 0, done.stderr
    assert EXAMPLE_ALLOWED in (tmp_path / "out" / build.WORKFLOW_FILE).read_text(encoding="utf-8")


def test_example_without_out_writes_a_temp_folder_never_mark_dist(capsys):
    build.main(["--example"])
    written = Path(capsys.readouterr().out.strip().rsplit(" into ", 1)[1]).resolve()
    shutil.rmtree(written)  # the CLI made it; nothing else uses it
    assert Path(tempfile.gettempdir()).resolve() in written.parents
