import read_and_check
from _budgets import REVIEW_BOUNDS
from _checksum import json_size, locale_checksum
from _loop_items import review_input
from _run_folder import read_verified, run_root
from builders import ok, tool_body
from step_builders import (
    a_csv,
    a_ctx,
    a_finding,
    a_line,
    a_package,
    a_tool_report,
    a_webhook_input,
    attach,
    problems_of,
)

NUMBERS = a_finding("numbers", expected="30%", found="20 %", detail="The number differs.")
UNSURE = a_finding("language_column", "warning", "unsure", detail="Is the de-DE column German?")
FORMALITY = a_finding("formality", "warning")
FINDINGS = {("de-DE", None): [UNSURE], ("de-DE", "L1"): [NUMBERS], ("de-DE", "L2"): [FORMALITY]}
REPORTED = "Already reported by code (never report these again, in any form):"
LINES = (
    "[L1] email/subject\nMaster: Up to 30% off jackets\nTranslation: Bis zu 30 % auf Jacken\n"
    "Length: 22 chars\n\n"
    "[L2] email/body\nMaster: Hi {{first_name}}\nTranslation: Hallo {{first_name}}\n"
    "Length: 20 chars\n\n"
)


def checked(fake_tools, tmp_path, findings=None, pkg=None):
    """The step's output for pkg sent by webhook, and the check.json it wrote."""
    pkg = pkg or a_package()
    fake_tools.respond("localization_check", ok(tool_body(**a_tool_report(pkg, findings))))
    ctx = a_ctx(tmp_path)
    out = read_and_check.handler(a_webhook_input(pkg), ctx)
    stored = read_verified(
        out.get("run_key"), "check.json", out.get("check_checksum"), root=run_root(ctx)
    )
    return out, stored["data"]


def test_review_input_lists_each_line_and_the_findings_to_double_check(fake_tools, tmp_path):
    out, _ = checked(fake_tools, tmp_path, FINDINGS)
    assert out["locales"][0]["review_input"] == LINES + (
        f"{REPORTED}\nL1: numbers\nL2: formality\nwhole column: language_column\n\n"
        "Rule findings to double-check:\n"
        "[R1] whole column (language_column): Is the de-DE column German?\n"
        "[R2] L1 (numbers): The number differs. Expected: 30%. Found: 20 %."
    )


def test_review_input_says_none_when_nothing_to_double_check(fake_tools, tmp_path):
    out, _ = checked(
        fake_tools, tmp_path, {("de-DE", "L2"): [FORMALITY, a_finding("numbers", "warning")]}
    )
    assert out["locales"][0]["review_input"] == LINES + (
        f"{REPORTED}\nL2: formality, numbers\n\nRule findings to double-check: none."
    )


def test_rule_findings_are_flat_and_carry_their_refs(fake_tools, tmp_path):
    _, facts = checked(fake_tools, tmp_path, FINDINGS)
    found = [
        (f["line_id"], f["check"], f["confidence"], f["ref"])
        for f in facts["locales"][0]["rule_findings"]
    ]
    assert found == [
        (None, "language_column", "unsure", "R1"),
        ("L1", "numbers", "certain", "R2"),
        ("L2", "formality", "certain", None),
    ]


def test_refs_stop_at_the_reviews_bound_unsure_findings_first(fake_tools, tmp_path):
    bound, unsure = REVIEW_BOUNDS["rule_checks"], a_finding("currency_code", "warning", "unsure")
    many = {("de-DE", "L1"): [NUMBERS] * (bound + 1), ("de-DE", "L2"): [unsure, FORMALITY]}
    locale = checked(fake_tools, tmp_path, many)[1]["locales"][0]
    refs = [finding["ref"] for finding in locale["rule_findings"]]
    assert refs == [f"R{n}" for n in range(1, bound)] + [None, None, f"R{bound}", None]
    assert locale["unsent_checks"] == 2


def test_a_finding_without_confidence_is_certain(fake_tools, tmp_path):
    bare = {key: value for key, value in NUMBERS.items() if key != "confidence"}
    _, facts = checked(fake_tools, tmp_path, {("de-DE", "L1"): [bare]})
    assert facts["locales"][0]["rule_findings"][0]["confidence"] == "certain"


def test_checksum_present_and_recomputable(fake_tools, tmp_path):
    out, facts = checked(fake_tools, tmp_path, FINDINGS)
    loc = facts["locales"][0]
    assert (
        out["locales"][0]["checksum"]
        == loc["checksum"]
        == locale_checksum("de-DE", loc["lines"], loc["rule_findings"])
    )


def test_check_file_keeps_the_rules_version_and_master_lines(fake_tools, tmp_path):
    _, facts = checked(fake_tools, tmp_path)
    assert facts["rules_version"] == {"version": "1.0", "effective_date": "2026-11-13"}
    master = {"id": "L2", "channel": "email", "field": "body", "text": "Hi {{first_name}}"}
    assert facts["master_lines"][1] == master


def test_check_file_keeps_each_lines_length_and_spelling_fix(fake_tools, tmp_path):
    report = a_tool_report(a_package())
    report["locales"][0]["lines"][1]["spelling_fix"] = "Hallo {{first_name}}!"
    fake_tools.respond("localization_check", ok(tool_body(**report)))
    ctx = a_ctx(tmp_path)
    out = read_and_check.handler(a_webhook_input(a_package()), ctx)
    facts = read_verified(out["run_key"], "check.json", out["check_checksum"], root=run_root(ctx))
    length, fix = {"value": 20, "limit": None, "unit": "chars"}, "Hallo {{first_name}}!"
    line = {"id": "L2", "text": "Hallo {{first_name}}", "length": length, "spelling_fix": fix}
    assert facts["data"]["locales"][0]["lines"][1] == line


def test_back_translation_input_is_labelled(fake_tools, tmp_path):
    out, _ = checked(fake_tools, tmp_path)
    assert (
        out["locales"][0]["back_translation_input"]
        == "[L1] Bis zu 30 % auf Jacken\n[L2] Hallo {{first_name}}"
    )


def test_line_breaks_in_a_cell_become_spaces_for_back_translation(fake_tools, tmp_path):
    pkg = a_package(
        lines=[
            a_line("L1", "email", "body", **{"en-US": "Hi\nthere", "de-DE": "Hallo\r\nda\u2028du"})
        ]
    )
    out, _ = checked(fake_tools, tmp_path, pkg=pkg)
    assert out["locales"][0]["back_translation_input"] == "[L1] Hallo da du"


def test_length_with_a_limit_names_it():
    master = [{"id": "L3", "channel": "google_ads", "field": "headline", "text": "30% off jackets"}]
    line = {"id": "L3", "text": "Jacken", "length": {"value": 28, "limit": 30, "unit": "ads_chars"}}
    facts = {"lines": [line], "rule_findings": []}
    assert "\nLength: 28 of 30 ads_chars\n" in review_input(master, facts)


def test_master_not_english_is_a_problem(fake_tools, tmp_path):
    column = a_finding("language_column", "blocker")
    out, _ = checked(
        fake_tools,
        tmp_path,
        {("en-US", None): [column], ("en-US", "L2"): [a_finding("language_line", "warning")]},
    )
    assert problems_of(out["problems"]) == [
        "The en-US column doesn't read as English.",
        "Line L2 of the en-US master doesn't read as English.",
    ]
    assert [p["where"] for p in out["problems"]] == ["header", "row 3"]


def test_an_unsure_master_language_is_no_problem(fake_tools, tmp_path):
    out, _ = checked(
        fake_tools, tmp_path, {("en-US", None): [a_finding("language_column", "warning", "unsure")]}
    )
    assert out["route"] == "tlc_route_check"


def test_too_large_for_one_run(fake_tools, tmp_path):
    def rows(count):
        return [[f"L{n}", "email", "body", "a" * 900, "b" * 900] for n in range(count)]

    fake_tools.respond("localization_check", ok(tool_body(**a_tool_report(a_package()))))
    out = read_and_check.handler({}, attach(tmp_path, "bf.csv", a_csv(rows=rows(30))))
    assert problems_of(out["problems"]) == ["The file is too large to check in one run."]


def test_five_languages_of_fifty_lines_stay_well_under_the_return_cap(fake_tools, tmp_path):
    locales = ("de-DE", "fr-FR", "ja-JP", "en-GB", "de-CH")
    text = {"en-US": "x" * 200, **{locale: "y" * 200 for locale in locales}}
    pkg = a_package(locales=locales, lines=[a_line(f"L{n}", **text) for n in range(50)])
    out, _ = checked(fake_tools, tmp_path, pkg=pkg)
    assert out["route"] == "tlc_route_check" and json_size(out) < 200_000
