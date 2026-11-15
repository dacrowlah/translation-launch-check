"""Rewrites the tool's demo fixtures: each demo CSV the tool's demo test reads, as the
workflow parses it, to tool/test/fixtures/demo/<stem>.package.json.

    python scripts/write_demo_fixtures.py

Run it after changing a demo CSV; mark/tests/test_demo_files.py fails while a fixture is
stale.
"""

import json
from pathlib import Path

from send_package import DEMO, REPO, RULES, read_package

FIXTURES = REPO / "tool" / "test" / "fixtures" / "demo"
FIXTURE_SOURCES = (
    "black-friday-clean.csv",
    "black-friday-errors.csv",
    "black-friday-uk-ch.csv",
    "seeded-errors.csv",
    "encodings/1-campaign-utf8.csv",
)


def fixture_path(name, target=FIXTURES):
    """Where the fixture of demo file `name` lives: target/<stem>.package.json."""
    return target / f"{Path(name).stem}.package.json"


def _fixture_text(name, rules):
    package, problems = read_package(DEMO / name, rules)
    if problems:
        raise ValueError(f"{name} has problems; a demo fixture must parse cleanly")
    return json.dumps(package, ensure_ascii=False, indent=2) + "\n"


def write_fixtures(rules=RULES, target=FIXTURES):
    """Each FIXTURE_SOURCES file's package, written to its fixture_path."""
    target.mkdir(parents=True, exist_ok=True)
    for name in FIXTURE_SOURCES:
        fixture_path(name, target).write_text(_fixture_text(name, rules), encoding="utf-8")


if __name__ == "__main__":
    write_fixtures()
