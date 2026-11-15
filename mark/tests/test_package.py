import pytest

from _campaign import campaign_from, clean_campaign
from _config import RULES
from _locales import suggest_locale
from _package import validate_package
from builders import HIDDEN_PREFIXES
from step_builders import a_line, a_package, problems_of


def check(pkg):
    return problems_of(validate_package(pkg, RULES))


def test_a_valid_package_has_no_problems():
    assert check(a_package(locales=("de-DE", "fr-FR", "ja-JP", "en-GB", "de-CH"))) == []


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("de-de", "de-DE"),
        ("UK", "en-GB"),
        ("en-UK", "en-GB"),
        ("jp", "ja-JP"),
        ("ch", "de-CH"),
        ("de_DE", "de-DE"),
        ("xx-XX", None),
    ],
)
def test_suggests_a_locale_for_a_near_miss(name, expected):
    assert suggest_locale(name, RULES) == expected


def test_unknown_locale_without_a_near_miss_lists_the_supported_ones():
    problems = validate_package(a_package(locales=("xx-XX",)), RULES)
    assert problems[0]["suggestion"] == "Use one of: de-DE, fr-FR, ja-JP, en-GB, de-CH."


def test_duplicate_and_master_columns():
    pkg = a_package(locales=("de-DE", "de-DE", "en-US"))
    assert check(pkg)[:2] == [
        "Column de-DE appears more than once.",
        "Column en-US is the master; list it only once.",
    ]


def test_too_many_targets_stops_the_per_locale_checks():
    pkg = a_package(locales=("de-DE", "fr-FR", "ja-JP", "en-GB", "de-CH", "xx-XX"))
    assert check(pkg) == ["The file has 6 translation columns; the limit is 5."]


def test_no_targets():
    assert check(a_package(locales=()))[0] == "The file has no translation columns."


def test_too_many_lines_stops_the_per_line_checks():
    lines = [a_line("", **{"en-US": "", "de-DE": ""}) for _ in range(51)]
    assert check(a_package(lines=lines)) == ["The file has 51 rows; the limit is 50."]


def test_fifty_lines_are_checked():
    lines = [a_line(f"L{n}", **{"en-US": "Hi", "de-DE": "Hallo"}) for n in range(50)]
    assert check(a_package(lines=lines)) == []


def test_missing_and_too_long_ids():
    lines = [
        a_line(" ", **{"en-US": "Hi", "de-DE": "Hallo"}),
        a_line("L" * 41, **{"en-US": "Hi", "de-DE": "Hallo"}),
    ]
    assert check(a_package(lines=lines)) == [
        "Row 2 needs an id of 1-40 characters.",
        "Row 3 needs an id of 1-40 characters.",
    ]


def test_a_whitespace_cell_is_empty_and_names_the_row_without_an_id():
    line = a_line("", **{"en-US": "Hi", "de-DE": " \u00a0\n"})
    assert check(a_package(lines=[line]))[1] == "Row 2 has no de-DE text."


def test_cell_length_limit():
    ok, long = "x" * 1000, "x" * 1001
    lines = [
        a_line("L1", **{"en-US": ok, "de-DE": ok}),
        a_line("L2", **{"en-US": ok, "de-DE": long}),
    ]
    assert check(a_package(lines=lines)) == ["L2's de-DE text is longer than 1000 characters."]


@pytest.mark.parametrize("where", ["en-US", "de-DE", "id", "channel"])
def test_reserved_prefix_anywhere_in_a_row_any_case(where):
    line = a_line(**{"en-US": "Hi", "de-DE": "Hallo"})
    target = line["texts"] if where in line["texts"] else line
    target[where] = "x TLC_Route_fix"
    assert 'Row 2 contains the reserved word "tlc_route".' in check(a_package(lines=[line]))


@pytest.mark.parametrize("hidden", list(HIDDEN_PREFIXES))
def test_a_reserved_prefix_split_by_an_invisible_character_is_rejected(hidden):
    line = a_line(**{"en-US": "Hi", "de-DE": f"Hallo {hidden}"})
    assert 'Row 2 contains the reserved word "tlc_route".' in check(a_package(lines=[line]))


def test_echoed_values_are_one_short_line():
    pkg = a_package(locales=("de-DE\n" + "x" * 60,))
    assert check(pkg)[0] == "Column de-DE " + "x" * 34 + " isn't a supported locale."


def test_campaign_from_file_name():
    assert campaign_from("Black Friday 2026 (final).csv") == "Black Friday 2026 final"
    assert campaign_from("exports/Sommer_Sale-DE.csv") == "Sommer_Sale-DE"


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("F\u00eate d\u2019\u00e9t\u00e9", "F\u00eate d\u00e9t\u00e9"),  # letters kept
        ("Fe\u0302te", "F\u00eate"),  # NFC first: the combining mark joins its letter
        ("Sale\u200b\u202e\ue000\u0378 2026", "Sale 2026"),  # Cf, Co, Cn dropped
        ("Sale\u3164\u2800\u00a0Now", "Sale Now"),  # blank lookalikes dropped, NBSP -> space
        ("\u3164\u200b", "Untitled campaign"),
        (None, "Untitled campaign"),
        ("x" * 70, "x" * 60),
    ],
)
def test_clean_campaign(raw, expected):
    assert clean_campaign(raw) == expected
