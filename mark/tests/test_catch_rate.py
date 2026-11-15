"""scripts/catch_rate.py and the seeded test set's answer key."""

import json

import pytest
from catch_rate import ANSWERS, NO_FOUND, catch_rate, main

from _config import RULES
from _csv_package import parse_csv

RULE_CHECKS = {
    "numbers",
    "currency_amount",
    "dates",
    "weekday_date_match",
    "merge_tags",
    "url_params",
    "promo_codes",
    "template_leftovers",
    "length_hard",
    "formality",
    "glossary_forbidden",
    "glossary_dnt",
    "untranslated",
    "trademark_symbols",
    "markup",
    "time_zone",
    "language_line",
}
KEY = [
    {"locale": "de-DE", "line_id": "S1", "check": "numbers"},
    {"locale": "fr-FR", "line_id": "S2", "check": "claim"},
    {"locale": "ja-JP", "line_id": "S3", "check": "merge_tags"},
]
# The Score step's output as saved from the run log: its found list repeats an extra entry.
SCORE_OUTPUT = {
    "route": "tlc_route_fix",
    "outcome": "fix_first",
    "found": [
        "de-DE S1 numbers",
        "de-DE - tone",
        "de-DE - tone",
        "fr-FR S2 meaning",
    ],
}
RESULT = {
    "caught": ["de-DE S1 numbers"],
    "missed": ["fr-FR S2 claim", "ja-JP S3 merge_tags"],
    "extra": ["de-DE - tone", "fr-FR S2 meaning"],
    "rate": "1/3",
}


def answers():
    return json.loads(ANSWERS.read_text(encoding="utf-8"))


def seeded_package():
    path = ANSWERS.parent / "seeded-errors.csv"
    return parse_csv(path.read_bytes(), path.name, RULES)[0]


def a_file(tmp_path, name, content):
    path = tmp_path / name
    path.write_text(content if isinstance(content, str) else json.dumps(content), encoding="utf-8")
    return str(path)


def test_catch_rate_counts_caught_missed_and_extra_once_each():
    assert catch_rate(SCORE_OUTPUT["found"], KEY) == RESULT


def test_a_run_that_finds_everything_and_nothing_else_scores_full_marks():
    found = ["de-DE S1 numbers", "fr-FR S2 claim", "ja-JP S3 merge_tags"]
    assert catch_rate(found, KEY) == {"caught": found, "missed": [], "extra": [], "rate": "3/3"}


def test_the_command_line_reads_the_saved_score_output(tmp_path, capsys):
    run, key = a_file(tmp_path, "run.json", SCORE_OUTPUT), a_file(tmp_path, "key.json", KEY)
    assert (main([run, "--answers", key]), json.loads(capsys.readouterr().out)) == (0, RESULT)


@pytest.mark.parametrize(
    "content",
    [
        None,  # no file at all
        "not json",
        [],
        {"route": "tlc_route_report"},  # a Score output without the found list
        {"found": "de-DE S1 numbers"},
        {"found": [1]},
    ],
)
def test_a_file_that_is_not_a_score_output_stops_with_a_clear_message(tmp_path, capsys, content):
    run = str(tmp_path / "run.json") if content is None else a_file(tmp_path, "run.json", content)
    with pytest.raises(SystemExit) as stop:
        main([run])
    last = capsys.readouterr().err.splitlines()[-1]
    assert (stop.value.code, last.endswith(f": error: {NO_FOUND.format(path=run)}")) == (2, True)


def test_the_answer_key_plants_each_of_the_17_rule_checks_once_and_three_claims():
    checks = [answer["check"] for answer in answers()]
    assert (sorted(checks), len(answers())) == (
        sorted([*RULE_CHECKS, "claim", "claim", "claim"]),
        20,
    )


def test_every_answer_is_a_distinct_line_and_locale_of_the_seeded_file():
    package = seeded_package()
    cells = {(line["id"], code) for line in package["lines"] for code in package["locales"]}
    planted = [(answer["line_id"], answer["locale"]) for answer in answers()]
    assert (set(planted) <= cells, len(set(planted))) == (True, 20)


def test_the_seeded_file_uses_all_five_target_locales():
    assert seeded_package()["locales"] == ["de-DE", "fr-FR", "ja-JP", "en-GB", "de-CH"]
