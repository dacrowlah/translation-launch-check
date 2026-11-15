"""Each code step's largest realistic input fits its budget (code_steps/_budgets.py), with
the caps the steps apply themselves: the back-translation cap before "Save the review", the
fixer cap before "Write and send the report", the problem cap before "Ask for a corrected
file"."""

import read_and_check
from _budgets import FIX_BOUNDS, REVIEW_BOUNDS, input_budget
from _checksum import json_size
from _fix_input import within_cap
from _loop_items import MAX_ENGLISH_BYTES
from step_builders import a_csv, a_review, a_review_finding, a_rule_check, attach

KEY, CHECKSUM = "0123456789abcdef", "fedcba9876543210"
JA = "\u30b8\u30e3\u30b1\u30c3\u30c8"  # five Japanese characters


def a_big_review(item):
    """The largest review the schema admits: every finding and second opinion at its bounds,
    the evidence all Japanese (each character escaped to six bytes)."""
    b = REVIEW_BOUNDS
    long = {"detail": "d" * b["detail"], "evidence": JA[0] * b["evidence"]}
    findings = [
        a_review_finding("L" * b["line_id"], "claim", "blocker", **long)
        for _ in range(b["findings"])
    ]
    opinions = [a_rule_check("R" * b["finding_id"], "real_problem", "r" * b["reason"])] * b[
        "rule_checks"
    ]
    return a_review(item, findings, opinions)


def test_save_reviews_largest_input_fits():
    item = {"locale": "de-DE", "checksum": CHECKSUM}
    back = "x" * (MAX_ENGLISH_BYTES - 2)
    biggest = {"run_key": KEY, **item, "review": a_big_review(item), "back_translation": back}
    assert json_size(biggest) <= input_budget("save_review")


def an_entry(n, start):
    names = {"locale": "ja-JP", "line_id": f"L{n}", "channel": "email", "field": "body"}
    return {
        **names,
        "master": "m" * 600,
        "text": start,
        "start_text": start,
        "length": None,
        "findings": [],
    }


def a_fix_for(entry, growth=1.2):
    """The fixer's draft for one line: a fifth longer than its start text, the note at its
    schema bound; the draft never past the schema's suggested_text bound."""
    size = min(FIX_BOUNDS["suggested_text"], int(len(entry["start_text"]) * growth))
    names = {"locale": entry["locale"], "line_id": entry["line_id"]}
    text = (entry["start_text"] * 2)[:size]
    return {**names, "suggested_text": text, "fits": True, "note": "n" * FIX_BOUNDS["note"]}


def fixes_for(entries):
    return [a_fix_for(entry) for entry in entries]


def test_reports_largest_input_fits_after_the_fixer_cap():
    for start in ("x" * 1000, JA * 60):
        kept = within_cap([an_entry(n, start) for n in range(60)])
        report_input = {
            "run_key": KEY,
            "verdict_checksum": CHECKSUM,
            "fixes": {"fixes": fixes_for(kept)},
        }
        assert 0 < len(kept) < 60 and json_size(report_input) <= input_budget("report")


def test_ask_for_a_corrected_files_largest_input_fits(tmp_path):
    rows = [["x" * 40, "e" * 40, "f" * 40, "", ""] for _ in range(50)]
    out = read_and_check.handler(
        {"trigger_name": "Chat"}, attach(tmp_path, "bf.csv", a_csv(rows=rows))
    )
    assert len(out["problems"]) == 26 and json_size({"problems": out["problems"]}) <= input_budget(
        "needs_info"
    )


def test_score_takes_two_keys():
    assert json_size({"run_key": KEY, "check_checksum": CHECKSUM}) <= input_budget("score")
