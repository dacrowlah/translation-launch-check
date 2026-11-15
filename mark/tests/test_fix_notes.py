"""A suggested fix that reads as a note, not copy, is refused; correct fixes are not. Every
finding here is a shape the tool really returns for that line (checked against the real
checks): glossary_dnt is a warning with no found value, untranslated quotes the whole line,
numbers are normalized ("20%")."""

import pytest

from _fix_notes import reads_as_a_note
from step_builders import a_finding


def a_scored_finding(check, severity, **values):
    """A rule finding as Score holds it: the tool's finding with no second opinion."""
    return {**a_finding(check, severity, **values), "opinion": None}


DNT_DETAIL = "A do-not-translate term is missing or was translated."
DNT = a_scored_finding("glossary_dnt", "warning", detail=DNT_DETAIL, expected="TrailPro")
JA_OLD = (
    "\u65b0\u3057\u3044\u30c8\u30ec\u30a4\u30eb\u30d7\u30ed\u30b8\u30e3\u30b1\u30c3\u30c8\uff1a"
    "\u9632\u6c34\u30fb\u8efd\u91cf\u3067\u3001\u51ac\u306e\u30c8\u30ec\u30a4\u30eb\u306b\u3074"
    "\u3063\u305f\u308a\u3002"
)
JA_FIXED = (
    "\u65b0\u3057\u3044TrailPro\u30b8\u30e3\u30b1\u30c3\u30c8\uff1a\u9632\u6c34\u30fb\u8efd\u91cf"
    "\u3067\u3001\u51ac\u306e\u30c8\u30ec\u30a4\u30eb\u306b\u3074\u3063\u305f\u308a\u3002"
)


def test_the_live_note_is_refused():
    live = "\u65b0\u3057\u3044TrailProjacket\u3067\u306f\u306a\u304f" + JA_FIXED
    assert reads_as_a_note(live, JA_OLD, [DNT]) is True


def test_a_note_quoting_the_old_katakana_is_refused():
    katakana = (
        "\u65b0\u3057\u3044\u30c8\u30ec\u30a4\u30eb\u30d7\u30ed\u30b8\u30e3\u30b1\u30c3\u30c8"
        "\u3067\u306f\u306a\u304f" + JA_FIXED
    )
    assert reads_as_a_note(katakana, JA_OLD, [DNT]) is True


def test_a_german_note_on_a_do_not_translate_term_is_refused():
    old = "Die neue Trail-Pro-Jacke ist da, bereit f\u00fcr den Winter."
    note = "Die neue TrailPro-Jacke (statt Trail-Pro-Jacke) ist da, bereit f\u00fcr den Winter."
    assert reads_as_a_note(note, old, [DNT]) is True


def test_a_french_note_on_a_do_not_translate_term_is_refused():
    old = "La nouvelle veste Trail Pro est arriv\u00e9e, pr\u00eate pour l'hiver."
    note = (
        "La nouvelle veste TrailPro (et non Trail Pro) est arriv\u00e9e, pr\u00eate pour l'hiver."
    )
    assert reads_as_a_note(note, old, [DNT]) is True


UNTRANSLATED = a_scored_finding(
    "untranslated", "warning", detail="The line is the same as the master.", found="Find your size"
)


def test_an_untranslated_fix_quoting_the_old_english_is_refused():
    note = "Finden Sie Ihre Gr\u00f6\u00dfe (statt Find your size)"
    assert reads_as_a_note(note, "Find your size", [UNTRANSLATED]) is True


NUMBERS_DETAIL = "A number differs from the master."
TIME_ZONE = a_scored_finding(
    "time_zone", "warning", detail="A time or deadline has no time zone.", found="23:59 Uhr"
)
SPELLING_DETAIL = "A word is not spelled the way this market spells it."
COLOUR = a_scored_finding(
    "locale_spelling", "warning", detail=SPELLING_DETAIL, expected="colour", found="color"
)
FRENCH_SPACING = "French spacing is missing before ; : ! ? or inside guillemets."
TYPOGRAPHY = a_scored_finding(
    "typography", "info", detail=FRENCH_SPACING, expected="% !", found="%!"
)
CORRECT = [
    (
        "Der Sale endet am Sonntag um 23:59 Uhr MEZ.",
        "Der Sale endet am Sonntag um 23:59 Uhr.",
        [TIME_ZONE],
    ),
    (
        "Up to 50% off jackets and 30% off boots this weekend.",
        "Up to 50% off jackets and 50% off boots this weekend.",
        [
            a_scored_finding(
                "numbers", "blocker", detail=NUMBERS_DETAIL, expected="30%", found="50%"
            )
        ],
    ),
    (
        "\u3054\u6ce8\u6587\u3054\u3068\u306b\u7121\u6599\u30ae\u30d5\u30c8\u3092\u3001\u304a"
        "\u4e00\u4eba\u69d81\u70b9\u307e\u3067\u300111\u670830\u65e5\u307e\u3067\u304a\u5c4a"
        "\u3051\u3057\u307e\u3059\u3002",
        "\u3054\u6ce8\u6587\u3054\u3068\u306b\u7121\u6599\u30ae\u30d5\u30c8\u3092\u3001\u304a"
        "\u4e00\u4eba\u69d82\u70b9\u307e\u3067\u300111\u670830\u65e5\u307e\u3067\u304a\u5c4a"
        "\u3051\u3057\u307e\u3059\u3002",
        [a_scored_finding("numbers", "blocker", detail=NUMBERS_DETAIL, expected="1", found="2")],
    ),
    (
        "New colours this season, in any colour you like.",
        "New colours this season, in any color you like.",
        [COLOUR],
    ),
    (
        "\u65b0\u3057\u3044TrailPro\u30b8\u30e3\u30b1\u30c3\u30c8\u3002TrailPro\u306a\u3089\u51ac"
        "\u306e\u3069\u3093\u306a\u30c8\u30ec\u30a4\u30eb\u3067\u3082\u30c9\u30e9\u30a4\u3067"
        "\u3059\u3002",
        "\u65b0\u3057\u3044\u30c8\u30ec\u30a4\u30eb\u30d7\u30ed\u30b8\u30e3\u30b1\u30c3\u30c8"
        "\u3002\u30c8\u30ec\u30a4\u30eb\u30d7\u30ed\u306a\u3089\u51ac\u306e\u3069\u3093\u306a"
        "\u30c8\u30ec\u30a4\u30eb\u3067\u3082\u30c9\u30e9\u30a4\u3067\u3059\u3002",
        [DNT],
    ),
    (
        "Vestes TrailPro : jusqu'\u00e0 -30 %!",
        "Vestes Trail Pro : jusqu'\u00e0 -30 %!",
        [DNT, TYPOGRAPHY],
    ),
    ("Finden Sie Ihre Gr\u00f6\u00dfe", "Find your size", [UNTRANSLATED]),
]


@pytest.mark.parametrize(("fix", "old", "findings"), CORRECT)
def test_a_correct_fix_is_not_a_note(fix, old, findings):
    assert reads_as_a_note(fix, old, findings) is False


def test_an_info_finding_does_not_hide_a_note():
    note = "Vestes TrailPro (et non Trail Pro) : jusqu'\u00e0 -30 %!"
    assert (
        reads_as_a_note(note, "Vestes Trail Pro : jusqu'\u00e0 -30 %!", [DNT, TYPOGRAPHY]) is True
    )


CLAIM = a_scored_finding("claim", "blocker", detail="The members-only condition was dropped.")


def test_a_line_with_more_than_term_problems_may_grow():
    fix = "Die neue TrailPro-Jacke, nur f\u00fcr Mitglieder."
    assert reads_as_a_note(fix, "Die neue Trail-Pro-Jacke.", [DNT, CLAIM]) is False


def test_a_missing_name_may_come_back_with_one_space():
    fix = "La nouvelle veste TrailPro est arriv\u00e9e."
    assert reads_as_a_note(fix, "La nouvelle veste est arriv\u00e9e.", [DNT]) is False


def test_one_character_more_than_the_name_and_a_space_is_a_note():
    old = "La nouvelle veste est arriv\u00e9e."
    assert reads_as_a_note("La nouvelle veste TrailPro! est arriv\u00e9e.", old, [DNT]) is True
