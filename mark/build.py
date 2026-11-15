"""Builds the importable Mark files: the workflow (code steps inlined, our agents bundled)
and the organization skills.

    python mark/build.py [--example] [--out DIR]

The private values come from exactly mark/local.config.json (gitignored), or with --example
from mark/local.config.example.json. A real build never falls back to the example or follows
TLC_CONFIG: a missing or incomplete local.config.json stops it (exit 2) with a message that
names no value. Without --out the build writes mark/dist/ (gitignored), or a new temp
folder with --example, so the example build never lands where an import would pick it up.
"""

import argparse
import json
import os
import sys
import tempfile
from pathlib import Path

from _build.skills import build_skills
from _build.workflow import assemble

MARK = Path(__file__).resolve().parent
STEPS = MARK / "code_steps"
RULES_FILE = MARK.parent / "tool" / "config" / "rules.json"
WORKFLOW_FILE = "translation_launch_check.json"


def _arguments(argv):
    parser = argparse.ArgumentParser(description="Build the importable Mark files.")
    parser.add_argument("--example", action="store_true", help="use the example config")
    parser.add_argument("--out", type=Path, help="output folder")
    return parser.parse_args(argv)


def ceilings():
    """Each step's code ceiling (code_steps/_budgets.py), never above MAX_CODE_BYTES."""
    if str(STEPS) not in sys.path:
        sys.path.insert(0, str(STEPS))
    import _budgets  # noqa: E402 - from code_steps, the one source the steps' caps use

    return {step: min(c, _budgets.MAX_CODE_BYTES) for step, c in _budgets.CODE_CEILINGS.items()}


class BuildError(Exception):
    """The build can't go on: a message for the person running it, naming no private value."""


def private_file(example, mark_dir=MARK):
    """The private config the build uses: the example with --example, else exactly
    mark/local.config.json (never the example, never TLC_CONFIG)."""
    return mark_dir / ("local.config.example.json" if example else "local.config.json")


MISSING = "{name} is missing: copy local.config.example.json to it and fill in the private values"


def _read_private(path, private_values):
    try:
        return private_values(path)
    except (KeyError, ValueError) as error:  # KeyError names the missing key; ValueError, a shape
        raise BuildError(f"{path.name} is incomplete: {error}") from None


def _checked_private(path, private_values):
    if not path.is_file():
        raise BuildError(MISSING.format(name=path.name))
    return _read_private(path, private_values)


def _plain(values):
    """The values, refused unless they are plain JSON: NaN or Infinity (which json.loads
    accepts) would ship as `nan` or `inf`, a NameError in every built step."""
    import _checksum  # noqa: E402 - from code_steps, on sys.path once ceilings() ran

    if _checksum.canonical_bytes(values) is None:
        raise BuildError("the config holds a value that isn't plain JSON (NaN or Infinity)")
    return values


def config_values(example, mark_dir=MARK):
    """RULES, the checked PRIVATE values of private_file(), and the code ceilings. _config is
    imported with TLC_CONFIG at the example, so its own import never fails on the real file;
    the real file is then read and checked on its own."""
    os.environ["TLC_CONFIG"] = str(MARK / "local.config.example.json")
    limits = ceilings()
    import _config  # noqa: E402 - after TLC_CONFIG is set: it reads that file at import

    private = _checked_private(private_file(example, mark_dir), _config.private_values)
    return {**_plain({"RULES": _config.RULES, "PRIVATE": private}), "CEILINGS": limits}


def _write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")


def _load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def built_files(out, config):
    """{path: JSON} for the workflow and every skill."""
    folders = {"steps": STEPS, "agents": MARK / "agents"}
    workflow = assemble(_load(MARK / "workflow" / "workflow.json"), folders, config)
    skills = build_skills(MARK / "skills", _load(RULES_FILE))
    return {out / WORKFLOW_FILE: workflow} | {
        out / "skills" / f"{k}.json": v for k, v in skills.items()
    }


def build(out, config):
    """Writes the workflow and every skill into out; returns the files written."""
    files = built_files(out, config)
    for path, value in files.items():
        _write(path, value)
    return sorted(files)


def _out(args):
    if args.out:
        return args.out
    return Path(tempfile.mkdtemp(prefix="tlc-build-")) if args.example else MARK / "dist"


def _built(args, config):
    out = _out(args)
    sys.stdout.write(f"built {len(build(out, config))} files into {out}\n")
    return 0


def _run(args):
    try:
        return _built(args, config_values(args.example))
    except BuildError as error:
        sys.stderr.write(f"build: {error}\n")
        return 2


def main(argv=None):
    """Exit 0 when built; 2 when the private config is missing or incomplete."""
    return _run(_arguments(argv))


if __name__ == "__main__":
    sys.exit(main())
