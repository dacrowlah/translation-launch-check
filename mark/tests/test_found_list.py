from _checksum import json_size
from step_builders import (
    a_checked_run,
    a_ctx,
    a_finding,
    a_line,
    a_package,
    a_review,
    a_review_finding,
    save,
    scored,
)

COLUMN = a_finding("language_column", "warning", "unsure")
NOTES = [
    a_review_finding("L2", "claim"),
    a_review_finding("[L2]", "claim"),
    a_review_finding("L9", "tone"),
]


def test_found_lists_rule_and_review_findings_once_each_in_order(fake_tools, tmp_path):
    ctx = a_ctx(tmp_path)
    checked = a_checked_run(
        fake_tools, ctx, {("de-DE", None): [COLUMN], ("de-DE", "L1"): [a_finding("numbers")]}
    )
    save(ctx, checked, checked["locales"][0], review=a_review(checked["locales"][0], NOTES))
    out, _ = scored(ctx, checked)
    assert out["found"] == ["de-DE L1 numbers", "de-DE L2 claim", "de-DE column language_column"]
    assert out["found_total"] == 3


def test_a_clean_run_finds_nothing(fake_tools, tmp_path):
    out, _ = scored(*a_clean(fake_tools, tmp_path))
    assert (out["found"], out["found_total"]) == ([], 0)


def a_clean(fake_tools, tmp_path):
    ctx = a_ctx(tmp_path)
    checked = a_checked_run(fake_tools, ctx)
    save(ctx, checked, checked["locales"][0])
    return ctx, checked


def score_all(fake_tools, ctx, findings, pkg):
    """The real steps up to Score, a clean review saved for every language."""
    checked = a_checked_run(fake_tools, ctx, findings, pkg)
    for item in checked["locales"]:
        save(ctx, checked, item)
    return scored(ctx, checked)[0]


FIVE = ("de-DE", "fr-FR", "ja-JP", "en-GB", "de-CH")


def a_five_hundred_finding_case():
    """5 languages x 50 lines x 2 findings."""
    texts = {"en-US": "Hi", **{code: "Hallo" for code in FIVE}}
    lines = [a_line(f"L{n}", **texts) for n in range(1, 51)]
    two = [a_finding("numbers"), a_finding("formality", "warning")]
    findings = {(code, line["id"]): two for code in FIVE for line in lines}
    return findings, a_package(locales=FIVE, lines=lines)


def test_found_is_capped_at_300_with_the_total_and_fits_the_return(fake_tools, tmp_path):
    out = score_all(fake_tools, a_ctx(tmp_path), *a_five_hundred_finding_case())
    assert len(out["found"]) == 300 and out["found_total"] == 500
    assert out["found"][0] == "de-CH L1 formality" and json_size(out) < 250_000
