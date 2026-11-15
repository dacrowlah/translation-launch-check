import pytest

from _config import RULES
from _csv_package import parse_csv
from step_builders import BOM, HEADER, a_csv, problems_of

SUBJECT = ["L1", "email", "subject"]


def parse(raw, name="bf.csv"):
    return parse_csv(raw, name, RULES)


def test_parses_excel_semicolon_bom_crlf_multiline():
    raw = a_csv(
        delimiter=";", bom=True, crlf=True, rows=[["L1", "email", "body", "Hi\nthere", "Hallo\nda"]]
    )
    pkg, problems = parse(raw)
    assert problems == [] and pkg["lines"][0]["texts"] == {
        "en-US": "Hi\nthere",
        "de-DE": "Hallo\nda",
    }


def test_builds_the_tool_contracts_package():
    pkg, _ = parse(a_csv(rows=[[*SUBJECT, "Hi", "Hallo"]]), "Black Friday 2026.csv")
    texts = {"en-US": "Hi", "de-DE": "Hallo"}
    line = {"id": "L1", "channel": "email", "field": "subject", "texts": texts}
    top = {"campaign": "Black Friday 2026", "master_locale": "en-US", "locales": ["de-DE"]}
    assert pkg == {**top, "lines": [line]}


@pytest.mark.parametrize("delimiter", [",", ";", "\t"])
def test_sniffs_the_delimiter_from_the_header(delimiter):
    pkg, problems = parse(a_csv(delimiter=delimiter, rows=[[*SUBJECT, "Hi, you", "Hallo; du"]]))
    assert problems == [] and pkg["lines"][0]["texts"]["de-DE"] == "Hallo; du"


def test_reports_every_problem_at_once():
    header = ["id", "channel", "field", "en-US", "jp"]
    raw = a_csv(header=header, rows=[[*SUBJECT, "Hi", ""], [*SUBJECT, "Yo", "x"]])
    pkg, problems = parse(raw)
    assert pkg is None and problems_of(problems) == [
        "Column jp isn't a supported locale.",
        "L1 has no jp text.",
        "The id L1 is used more than once.",
    ]
    assert [p["where"] for p in problems] == ["header", "row 2", "row 3"]
    assert problems[0]["suggestion"] == "Did you mean ja-JP?"


def test_master_must_be_en_us():
    raw = a_csv(
        header=["id", "channel", "field", "de-DE", "fr-FR"], rows=[[*SUBJECT, "Hallo", "Salut"]]
    )
    assert problems_of(parse(raw)) == ["The first locale column must be en-US, not de-DE."]


def test_header_must_start_with_id_channel_field():
    raw = a_csv(header=["key", "channel", "field", "en-US", "de-DE"])
    message = "The header must start with id, channel and field, then en-US and the translations."
    assert problems_of(parse(raw)) == [message]


def test_header_names_ignore_case_and_spaces():
    raw = a_csv(header=["ID ", "Channel", " field", "en-US", " de-DE "])
    assert parse(raw)[1] == []


def test_unknown_channel_field_pair():
    _, problems = parse(a_csv(rows=[["L1", "email", "subjectline", "Hi", "Hallo"]]))
    assert problems_of(problems) == ["L1: email/subjectline isn't a known channel and field."]
    assert problems[0]["suggestion"].startswith("Use one of: email/subject, email/preheader,")


def test_short_row_is_reported_and_its_missing_cell_is_empty():
    _, problems = parse(a_csv(rows=[[*SUBJECT, "Hi"]]))
    assert problems_of(problems) == [
        "L1 has no de-DE text.",
    ]


def test_trailing_blank_rows_are_ignored():
    raw = a_csv(delimiter=";", rows=[[*SUBJECT, "Hi", "Hallo"], ["", "", "", "", ""], []])
    assert parse(raw)[1] == []


def test_oversized_file_is_rejected_before_decoding():
    raw = b"\xff" * (RULES["limits"]["max_file_bytes"] + 1)
    assert problems_of(parse(raw)) == ["The file is larger than 64 KB."]


def test_largest_file_is_read():
    raw = a_csv(rows=[[*SUBJECT, "Hi", "Hallo"]])
    padded = raw + b" " * (RULES["limits"]["max_file_bytes"] - len(raw))
    assert parse(padded)[1] == []


def test_not_utf8():
    raw = "id,channel,field,en-US,de-DE\nL1,email,subject,Hi,Gr\u00fc\u00dfe\n".encode("cp1252")
    _, problems = parse(raw)
    assert problems == [
        {
            "where": "file",
            "message": "The file isn't UTF-8 text.",
            "suggestion": "Save it as CSV UTF-8 and attach it again.",
        }
    ]


def test_nul_is_rejected():
    assert problems_of(parse(a_csv(rows=[[*SUBJECT, "Hi\x00", "Hallo"]]))) == [
        "The file contains a NUL character."
    ]


@pytest.mark.parametrize("raw", [b"", BOM, b"\n\n"])
def test_empty_file(raw):
    assert problems_of(parse(raw)) == ["The file is empty."]


def test_header_only_has_no_rows():
    assert problems_of(parse(a_csv(rows=[]))) == ["The file has no rows to check."]


def test_formula_like_cell_stays_text():
    pkg, _ = parse(a_csv(rows=[[*SUBJECT, "=HYPERLINK(1)", "=HYPERLINK(1)"]]), "x.csv")
    assert pkg["lines"][0]["texts"]["en-US"] == "=HYPERLINK(1)"


def test_copy_cells_keep_their_spaces_and_ids_are_trimmed():
    pkg, _ = parse(a_csv(rows=[[" L1 ", "email", "subject", " Hi ", "Hallo  "]]))
    assert pkg["lines"][0]["id"] == "L1" and pkg["lines"][0]["texts"] == {
        "en-US": " Hi ",
        "de-DE": "Hallo  ",
    }


def test_reserved_prefix_in_the_file_name_is_rejected():
    assert problems_of(parse(a_csv(), "tlc_route_fix.csv")) == [
        'The campaign name contains the reserved word "tlc_route".'
    ]


def test_header_keeps_its_columns_in_order():
    pkg, _ = parse(a_csv(header=[*HEADER, "fr-FR"], rows=[[*SUBJECT, "Hi", "Hallo", "Salut"]]))
    assert pkg["locales"] == ["de-DE", "fr-FR"]


GHOSTS = (
    b"id;channel;field;en-US;de-DE;;\r\nL1;email;subject;Hi;Hallo;;\r\nL2;email;body;Yo;Na;;\r\n"
)


def test_excel_ghost_columns_are_dropped():
    pkg, problems = parse(GHOSTS)
    assert problems == [] and pkg["locales"] == ["de-DE"]


def test_a_blank_header_between_columns_is_named_by_its_position():
    raw = a_csv(
        header=["id", "channel", "field", "en-US", "", "de-DE"],
        rows=[[*SUBJECT, "Hi", "x", "Hallo"]],
    )
    assert problems_of(parse(raw))[0] == "Column 5 has no locale name."


def test_a_blank_row_in_the_middle_is_one_problem():
    raw = a_csv(
        delimiter=";",
        rows=[[*SUBJECT, "Hi", "Hallo"], ["", "", "", "", ""], ["L3", "email", "body", "Yo", "Na"]],
    )
    assert problems_of(parse(raw)) == ["Row 3 is empty."]


# Demo file 4's shape with only en-US and ja-JP: Excel's ANSI save writes "?" for Japanese,
# so the file is pure ASCII and decodes as UTF-8.
EN_JA = [
    ["L1", "email", "subject", "Black Friday: 30% off", "????????????????30%??"],
    ["L2", "email", "body", "Hi {{first_name}}", "{{first_name}}?????? https://example.com/bf"],
]
QUESTION_MARKS = (
    "L1's ja-JP text is mostly question marks: the file was probably saved in the wrong encoding."
)


def test_text_turned_into_question_marks_by_the_wrong_encoding():
    header = ["id", "channel", "field", "en-US", "ja-JP"]
    _, problems = parse(a_csv(header=header, rows=EN_JA))
    assert problems_of(problems) == [QUESTION_MARKS]
    assert problems[0]["suggestion"] == "Save it as CSV UTF-8 and attach it again."


def test_a_few_question_marks_are_copy():
    assert parse(a_csv(rows=[[*SUBJECT, "Why wait???", "Warum warten???"]]))[1] == []
