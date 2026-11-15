"""The corrected file: the checked file with the fixes that passed the re-check applied, as a
CSV the user can re-upload as is, and the report's lines about it."""

from _config import RULES
from _corrected_file import COLUMNS, applied_fixes, corrected_csv, open_lines
from _csv_package import FIXED_COLUMNS, parse_csv
from builders import FILE_LINK, a_written_file, error
from report_support import delivered_with, write
from step_builders import (
    a_ctx,
    a_finding,
    a_fix,
    a_line,
    a_package,
    a_scored_run,
    a_tool_report,
    ok_body,
)

TRICKY = 'Sagen Sie "Hallo", jetzt\nmit Zeilenumbruch'


def a_line_of(line_id, master, texts):
    return {"id": line_id, "channel": "email", "field": "body", "master": master, "texts": texts}


def a_scores(lines, findings=None):
    """scores.json as the report reads it: per locale, its lines and findings."""
    locales = sorted({code for line in lines for code in line["texts"]})
    return {
        "campaign": "Black Friday 2026",
        "locales": [
            {
                "locale": code,
                "lines": [{**line, "text": line["texts"][code]} for line in lines],
                "findings": (findings or {}).get(code, []),
            }
            for code in locales
        ],
    }


LINES = [
    a_line_of("L1", "Up to 30%, today", {"de-DE": "Bis zu 20 %, heute", "fr-FR": "Jusqu'a -30 %"}),
    a_line_of("L2", "Hi, friend", {"de-DE": TRICKY, "fr-FR": "Salut, l'ami"}),
]
SCORES = a_scores(LINES)


def a_passed_fix(locale, line_id, text, status="passes"):
    return {"locale": locale, "line_id": line_id, "text": text, "status": status}


FIXES = [
    a_passed_fix("de-DE", "L1", "Bis zu 30 %, heute"),
    a_passed_fix("fr-FR", "L2", "Bonjour, l'ami", "still_has"),
    a_passed_fix("fr-FR", "L1", "Jusqu'a -30 % !", "not_rechecked"),
]


def test_the_fixed_columns_are_the_parsers():
    assert COLUMNS == FIXED_COLUMNS


def test_only_fixes_that_passed_the_recheck_are_applied():
    assert applied_fixes(SCORES, FIXES) == {("de-DE", "L1"): "Bis zu 30 %, heute"}


def test_a_fix_to_a_line_with_a_price_or_currency_finding_is_never_applied():
    findings = {"de-DE": [{**a_finding("currency_code", "warning"), "line_id": "L1"}]}
    assert applied_fixes(a_scores([SCORES["locales"][0]["lines"][0]], findings), FIXES) == {}


def test_the_csv_keeps_the_header_and_rows_with_a_bom_crlf_and_csv_quoting():
    assert corrected_csv(SCORES, applied_fixes(SCORES, FIXES)) == (
        "\ufeffid,channel,field,en-US,de-DE,fr-FR\r\n"
        'L1,email,body,"Up to 30%, today","Bis zu 30 %, heute",Jusqu\'a -30 %\r\n'
        'L2,email,body,"Hi, friend",'
        '"Sagen Sie ""Hallo"", jetzt\nmit Zeilenumbruch","Salut, l\'ami"\r\n'
    )


def test_the_csv_parses_back_to_the_same_lines_with_the_fix_applied():
    raw = corrected_csv(SCORES, applied_fixes(SCORES, FIXES)).encode("utf-8")
    pkg, problems = parse_csv(raw, "Black Friday 2026.csv", RULES)
    assert problems == [] and [line["texts"]["de-DE"] for line in pkg["lines"]] == [
        "Bis zu 30 %, heute",
        TRICKY,
    ]


def test_flagged_lines_without_an_applied_fix_still_need_a_person():
    def at(line_id, *finding):
        return {**a_finding(*finding), "line_id": line_id}

    de = [at("L2", "numbers"), at("L1", "numbers")]  # L1 has an applied fix
    fr = [at("L2", "dates", "warning"), at("L1", "typography", "info")]  # info needs no one
    scores = a_scores(LINES, {"de-DE": de, "fr-FR": fr})
    assert open_lines(scores, {("de-DE", "L1"): "Bis zu 30 %, heute"}) == 2


NUMBERS = a_finding("numbers", expected="30%", found="20 %")
TWO_FLAGGED = {("de-DE", "L1"): [NUMBERS], ("de-DE", "L2"): [a_finding("formality", "warning")]}


def fixed_run(fake_tools, ctx, written):
    """L1 and L2 flagged; L1's fix passes the re-check; L2 is left for a person."""
    scored = a_scored_run(fake_tools, ctx, TWO_FLAGGED)
    fixed = a_line("L1", **{"en-US": "Up to 30% off jackets", "de-DE": "Bis zu 30 % auf Jacken!"})
    fake_tools.respond("localization_check", ok_body(a_tool_report(a_package(lines=[fixed]))))
    fixes = {"fixes": [a_fix(text="Bis zu 30 % auf Jacken!")]}
    return scored, delivered_with(fake_tools, ctx, {**scored, "fixes": fixes}, written)


def test_the_report_links_the_corrected_file_and_counts_what_is_left(fake_tools, tmp_path):
    scored, out = fixed_run(fake_tools, a_ctx(tmp_path), a_written_file())
    lines = f"Corrected file (1 fix applied, re-checked): [Download]({FILE_LINK})\n"
    assert lines + "1 line still needs a person." in out["message"]
    params = next(p for name, p in fake_tools.calls if name == "write_content_to_file")
    assert params["filename"] == f"Black Friday 2026 - corrected - {scored['run_key'][:6]}.csv"
    assert (
        params["content"].splitlines()[1]
        == "L1,email,subject,Up to 30% off jackets,Bis zu 30 % auf Jacken!"
    )


def test_a_failed_write_is_one_line_and_the_report_still_answers(fake_tools, tmp_path):
    _, out = fixed_run(fake_tools, a_ctx(tmp_path), error(500))
    assert "The corrected file couldn't be saved; apply the fixes above by hand." in out["message"]
    assert "Corrected file (" not in out["message"] and out["canvas_url"] is not None


def test_no_passing_fix_means_no_export(fake_tools, tmp_path):
    ctx = a_ctx(tmp_path)
    out = write(fake_tools, ctx, a_scored_run(fake_tools, ctx, TWO_FLAGGED))
    assert "write_content_to_file" not in [name for name, _ in fake_tools.calls]
    assert "orrected file" not in out["message"]


JA_MASTER = "Meet the new TrailPro jacket: waterproof, light and made for winter trails."
JA_FIXED = (
    "\u65b0\u3057\u3044TrailPro\u30b8\u30e3\u30b1\u30c3\u30c8\uff1a"
    "\u9632\u6c34\u30fb\u8efd\u91cf\u3067\u3001\u51ac\u306e\u30c8\u30ec\u30a4\u30eb\u306b\u3074\u3063\u305f\u308a\u3002"
)
JA_NOTE = (
    "\u65b0\u3057\u3044TrailProjacket\u3067\u306f\u306a\u304f" + JA_FIXED
)  # observed live: a correction note as copy


def applied_to_one_line(master, finding, text):
    """applied_fixes for one ja-JP line with one rule finding and one passing fix."""
    scores = a_scores(
        [a_line_of("L5", master, {"ja-JP": "x"})], {"ja-JP": [{**finding, "line_id": "L5"}]}
    )
    return applied_fixes(scores, [a_passed_fix("ja-JP", "L5", text)])


DNT = a_finding("glossary_dnt", expected="TrailPro")


def test_a_fix_that_reads_as_a_correction_note_is_not_applied():
    assert applied_to_one_line(JA_MASTER, DNT, JA_NOTE) == {}
    assert applied_to_one_line(JA_MASTER, DNT, JA_FIXED) == {("ja-JP", "L5"): JA_FIXED}


def test_a_fix_that_still_has_the_found_value_is_not_applied():
    numbers = a_finding("numbers", expected="30%", found="20 %")
    assert applied_to_one_line("Up to 30% off", numbers, "Bis zu 30 % statt 20 % Rabatt") == {}


def test_values_the_market_spells_its_own_way_and_words_containing_the_found_one_pass():
    spelling = a_finding("locale_spelling", "warning", expected="favourite", found="favorite")
    assert applied_to_one_line("your favorite colors", spelling, "your favourite colours")
    formality = a_finding("formality", "warning", expected="formal", found="dir")
    assert applied_to_one_line("Shop now", formality, "Kaufen Sie direkt")
