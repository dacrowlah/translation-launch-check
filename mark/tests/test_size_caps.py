import read_and_check
from _loop_items import size_problems
from step_builders import (
    a_csv,
    a_ctx,
    a_line,
    a_package,
    a_tool_report,
    a_webhook_input,
    ok_body,
    problems_of,
)

# "Black Friday: 30% off everything." in Japanese, 18 characters.
JA = "\u30d6\u30e9\u30c3\u30af\u30d5\u30e9\u30a4\u30c7\u30fc\u306f\u5168\u54c130%\u30aa\u30d5\u3002"
LATIN = "Black Friday: 30% off every jacket, members first, free returns until Sunday."
REALISTIC = {"en-US": LATIN, "de-DE": LATIN + " de", "fr-FR": LATIN + " fr", "en-GB": LATIN}


def an_item(review="", back_translation=""):
    return {
        "locale": "de-DE",
        "review_input": review,
        "back_translation_input": back_translation,
        "checksum": "c",
    }


TOO_LARGE = ["The file is too large to check in one run."]


def test_each_agents_input_has_its_own_cap():
    assert size_problems([an_item(back_translation="x" * 65_998)], []) == []
    assert problems_of(size_problems([an_item(back_translation="x" * 65_999)], [])) == TOO_LARGE
    assert size_problems([an_item(review="x" * 65_996)], []) == []
    assert problems_of(size_problems([an_item(review="x" * 65_997)], [])) == TOO_LARGE


def test_the_expected_back_translation_has_its_own_cap():
    def master(size):
        return [{"id": "L1", "text": "x" * size}]

    # "[L1] " + text as JSON is the text plus 7; the cap is save_review's budget (58,000)
    # less the largest review the schema admits (29,720) and 200 for its small keys: 28,080.
    assert size_problems([an_item()], master(28_073)) == []
    assert problems_of(size_problems([an_item()], master(28_074))) == TOO_LARGE


def test_all_items_together_fit_the_return():
    assert size_problems([an_item(review="x" * 60_000)] * 3, []) == []
    assert problems_of(size_problems([an_item(review="x" * 60_000)] * 4, [])) == TOO_LARGE


def checked_route(fake_tools, tmp_path, pkg):
    fake_tools.respond("localization_check", ok_body(a_tool_report(pkg)))
    return read_and_check.handler(a_webhook_input(pkg), a_ctx(tmp_path))["route"]


def lines_of(count, texts):
    return [a_line(f"L{n}", "email", "body", **texts) for n in range(1, count + 1)]


def test_a_realistic_fifty_line_file_in_four_languages_with_japanese_passes(fake_tools, tmp_path):
    latin = "Black Friday: 30% off every jacket, members first, free returns until Sunday."
    texts = {
        "en-US": latin,
        "de-DE": latin + " de",
        "fr-FR": latin + " fr",
        "en-GB": latin,
        "ja-JP": (JA * 4)[:60],
    }
    pkg = a_package(locales=("de-DE", "fr-FR", "en-GB", "ja-JP"), lines=lines_of(50, texts))
    assert len(a_csv(rows=[[*["L"] * 3, *t.values()] for t in [texts] * 50])) < 65_536
    assert checked_route(fake_tools, tmp_path, pkg) == "tlc_route_check"


def test_a_japanese_file_a_third_of_the_file_cap_passes(fake_tools, tmp_path):
    texts = {"en-US": "x" * 150, "ja-JP": (JA * 6)[:100]}
    pkg = a_package(locales=("ja-JP",), lines=lines_of(50, texts))
    assert checked_route(fake_tools, tmp_path, pkg) == "tlc_route_check"
