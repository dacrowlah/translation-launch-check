"""The demo CSVs as the workflow reads them: the files shown live parse cleanly, the broken
one lists exactly its three problems, and the tool's demo fixtures match the CSVs."""

import json

import pytest
from send_package import DEMO
from write_demo_fixtures import FIXTURE_SOURCES, fixture_path, write_fixtures

from _config import RULES
from _csv_package import parse_csv

NOT_UTF8 = {
    "where": "file",
    "message": "The file isn't UTF-8 text.",
    "suggestion": "Save it as CSV UTF-8 and attach it again.",
}

BROKEN_FILE_PROBLEMS = [
    {
        "where": "header",
        "message": "Column jp isn't a supported locale.",
        "suggestion": "Did you mean ja-JP?",
    },
    {
        "where": "row 5",
        "message": "L4 has no fr-FR text.",
        "suggestion": "Fill in every cell, or delete the row.",
    },
    {
        "where": "row 7",
        "message": "The id L5 is used more than once.",
        "suggestion": "Give every row a unique id.",
    },
]


def parse(name):
    path = DEMO / name
    return parse_csv(path.read_bytes(), path.name, RULES)


def cells(package):
    """{(line id, locale): text} for every cell of a package."""
    return {
        (line["id"], code): text
        for line in package["lines"]
        for code, text in line["texts"].items()
    }


@pytest.mark.parametrize(
    "name",
    [
        "template.csv",
        "black-friday-clean.csv",
        "black-friday-errors.csv",
        "black-friday-uk-ch.csv",
        "seeded-errors.csv",
    ],
)
def test_the_demo_files_parse_without_problems(name):
    package, problems = parse(name)
    assert (package is not None, problems) == (True, [])


def test_the_broken_file_lists_exactly_its_three_problems():
    assert parse("black-friday-broken.csv") == (None, BROKEN_FILE_PROBLEMS)


def test_the_errors_file_differs_from_the_clean_one_only_in_the_planted_cells():
    clean = cells(parse("black-friday-clean.csv")[0])
    errors = cells(parse("black-friday-errors.csv")[0])
    changed = {key for key in clean if clean[key] != errors[key]}
    assert (set(errors) == set(clean), changed) == (
        True,
        {("L1", "de-DE"), ("L2", "de-DE"), ("L2", "fr-FR"), ("L5", "ja-JP")},
    )


def test_the_template_is_the_clean_files_header_and_first_rows():
    template, clean = parse("template.csv")[0], parse("black-friday-clean.csv")[0]
    assert template["lines"] == clean["lines"][:3]


@pytest.mark.parametrize(
    "name", ["2-campaign-excel-csv-utf8-bom.csv", "3-campaign-excel-german-semicolon-bom.csv"]
)
def test_the_encoding_files_saved_as_utf8_read_like_the_plain_one(name):
    plain, saved = parse("encodings/1-campaign-utf8.csv")[0], parse(f"encodings/{name}")[0]
    assert {**saved, "campaign": plain["campaign"]} == plain


@pytest.mark.parametrize(
    "name",
    [
        "4-campaign-excel-default-windows-1252.csv",
        "5-campaign-western-only-windows-1252.csv",
        "6-campaign-excel-japanese-shift-jis.csv",
    ],
)
def test_the_encoding_files_not_saved_as_utf8_are_refused(name):
    assert parse(f"encodings/{name}") == (None, [NOT_UTF8])


@pytest.mark.parametrize("name", FIXTURE_SOURCES)
def test_each_demo_fixture_is_the_current_csv(name):
    fixture = fixture_path(name).read_text(encoding="utf-8")
    assert json.loads(fixture) == parse(name)[0]


def test_write_fixtures_writes_each_fixture_source_as_parsed(tmp_path):
    write_fixtures(target=tmp_path)
    written = {
        path.name: json.loads(path.read_text(encoding="utf-8")) for path in tmp_path.iterdir()
    }
    assert written == {
        fixture_path(name, tmp_path).name: parse(name)[0] for name in FIXTURE_SOURCES
    }
