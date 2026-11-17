"""Mark decodes a non-UTF-8 chat attachment as Windows-1252 before our code sees it
(verified): Shift_JIS Japanese arrives as mojibake. Such a cell is refused with the encoding
advice; real European copy with accents, guillemets, euro signs and dashes is not."""

import pytest

from _config import RULES
from _csv_package import parse_csv
from _package import GARBLED_PERCENT, MIN_GARBLED, _garbled
from builders import MARK_DIR
from step_builders import a_csv, problems_of

# ja L1 of encodings file 6 (Shift_JIS) as Mark delivered it, observed live.
OBSERVED = (
    "\u0192u\u0192\u2030\u0192b\u0192N\u0192t\u0192\u2030\u0192C\u0192f[F"
    "\u2018S\u0192W\u0192\u0192\u0192P\u0192b\u0192g30%\u0192I\u0192t"
)
DEMO = MARK_DIR.parent / "demo"
JA = ["id", "channel", "field", "en-US", "ja-JP"]


def as_mark_delivers(text):
    """Shift_JIS bytes decoded as Windows-1252; its five undefined bytes dropped."""
    raw = text.encode("shift_jis")
    return "".join(bytes([byte]).decode("cp1252", "ignore") for byte in raw)


def test_the_observed_japanese_cell_is_refused_with_the_encoding_advice():
    _, problems = parse_csv(
        a_csv(header=JA, rows=[["L1", "email", "subject", "Hi", OBSERVED]]), "bf.csv", RULES
    )
    assert problems_of(problems) == [
        "L1's ja-JP text looks garbled: the file was probably saved in the wrong encoding."
    ]
    assert problems[0]["suggestion"] == "Save it as CSV UTF-8 and attach it again."


def demo_cells(name, column):
    pkg, problems = parse_csv((DEMO / name).read_bytes(), name, RULES)
    assert problems == []
    return [line["texts"][column] for line in pkg["lines"]]


def test_every_demo_japanese_cell_garbled_by_shift_jis_is_caught():
    cells = demo_cells("black-friday-clean.csv", "ja-JP") + demo_cells(
        "black-friday-launch.csv", "ja-JP"
    )
    assert all(_garbled(as_mark_delivers(cell)) for cell in cells)


@pytest.mark.parametrize(
    "name", ["black-friday-clean.csv", "black-friday-launch.csv", "black-friday-uk-ch.csv"]
)
def test_the_demo_files_have_no_garbled_cell(name):
    assert parse_csv((DEMO / name).read_bytes(), name, RULES)[1] == []


@pytest.mark.parametrize(
    "text",
    [
        "\u00ab Prix : 49,90 \u20ac \u2013 \u00e9t\u00e9 \u00bb",
        "C\u0153ur \u00e0 prix doux : \u00ab \u00c9t\u00e9 \u00bb \u2013 49,90 "
        "\u20ac \u2026 d\u00e9j\u00e0 l\u00e0",
        "\u201eGr\u00fc\u00dfe\u201c \u2013 \u00c4pfel, "
        "\u00d6l, \u00dcbergr\u00f6\u00dfen f\u00fcr 19,99 \u20ac",
        "Gr\u00fcsse aus Z\u00fcrich \u2013 ab CHF 49.90 \u2022 \u00abJetzt\u00bb",
    ],
)
def test_dense_european_copy_is_not_garbled(text):
    assert not _garbled(text)


def odd_cells(odd, plain, marker="\u0192"):
    """`odd` Windows-1252 characters (one of them the marker) and `plain` ASCII letters."""
    return marker + "\u00e9" * (odd - 1) + "a" * plain


def test_the_thresholds_at_their_boundaries():
    assert (MIN_GARBLED, GARBLED_PERCENT) == (5, 30)
    assert _garbled(odd_cells(5, 11)) and not _garbled(odd_cells(4, 0))  # count: 5 of 16
    assert _garbled(odd_cells(6, 14)) and not _garbled(odd_cells(6, 15))  # share: 30% of 20
    assert not _garbled("\u00e9" * 10) and _garbled("\x81" + "\u00e9" * 9)  # needs a marker
    assert _garbled(" ".join(odd_cells(6, 14)))  # spaces don't count
