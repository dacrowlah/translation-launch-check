import json

import pytest

import save_review
from _run_folder import read_review, run_root
from builders import RUN_KEY, an_execution_record
from step_builders import a_ctx

LEAK = "[[file]] (at least one needed)"
REVIEW = {"locale": "de-DE", "checksum": "abc", "findings": [], "rule_checks": []}


def save(ctx, **changes):
    base = {"run_key": RUN_KEY, "locale": "de-DE", "checksum": "abc", "review": REVIEW}
    return save_review.handler({**base, "back_translation": "[L1] Up to 30%", **changes}, ctx)


def saved(ctx, locale="de-DE"):
    return read_review(RUN_KEY, locale, "abc", root=run_root(ctx))


def test_writes_both_answers_for_score_to_bind(tmp_path):
    ctx = a_ctx(tmp_path)
    assert save(ctx) == {"saved": True, "summary": "Review saved."}
    record = {
        "locale": "de-DE",
        "checksum": "abc",
        "review": REVIEW,
        "back_translation": "[L1] Up to 30%",
    }
    stored = saved(ctx)
    assert (stored["status"], stored["data"]) == ("ok", record)


def test_a_review_as_json_text_is_stored_as_its_object(tmp_path):
    ctx = a_ctx(tmp_path)
    save(ctx, review='{"locale": "de-DE"}')
    assert saved(ctx)["data"]["review"] == {"locale": "de-DE"}


def test_answers_passed_as_execution_records_are_stored_as_the_answers(tmp_path):
    ctx = a_ctx(tmp_path)
    record = an_execution_record(json.dumps(REVIEW))
    save(ctx, review=json.dumps(record), back_translation=an_execution_record("[L1] Up to 30%"))
    data = saved(ctx)["data"]
    assert (data["review"], data["back_translation"]) == (REVIEW, "[L1] Up to 30%")


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        (f"[L1] Up to 30% or {LEAK}", "[L1] Up to 30%"),
        (f"[L1] Up to 30%\nor {LEAK}  \n", "[L1] Up to 30%"),
        (f"[L1] Buy or or\u00a0{LEAK}", "[L1] Buy or"),
        (f"[L1] Up to 30% {LEAK}", "[L1] Up to 30%"),
        ("[L1] Black or white", "[L1] Black or white"),
        ("[L1] or", "[L1] or"),
        (f"[L1] Welcome visitor {LEAK}", "[L1] Welcome visitor"),
    ],
)
def test_strips_only_the_translation_leak_at_the_end(tmp_path, text, expected):
    ctx = a_ctx(tmp_path)
    save(ctx, back_translation=text)
    assert saved(ctx)["data"]["back_translation"] == expected


@pytest.mark.parametrize("text", [f"or {LEAK}", "  ", None, {"text": "x"}])
def test_nothing_usable_is_stored_as_none(tmp_path, text):
    ctx = a_ctx(tmp_path)
    save(ctx, back_translation=text)
    assert saved(ctx)["data"]["back_translation"] is None


@pytest.mark.parametrize("changes", [{"run_key": "../x"}, {"locale": "../de-DE"}, {"locale": None}])
def test_a_bad_run_key_or_locale_writes_nothing(tmp_path, changes):
    ctx = a_ctx(tmp_path)
    assert save(ctx, **changes) == {"saved": False, "summary": "Review not saved."}
    assert not (tmp_path / "tlc").exists()


def test_never_fails(tmp_path):
    assert save_review.handler(None, a_ctx(tmp_path)) == {
        "saved": False,
        "summary": "Review not saved.",
    }


def test_prints_nothing(tmp_path, capsys):
    save(a_ctx(tmp_path))
    save_review.handler(None, a_ctx(tmp_path))
    assert capsys.readouterr() == ("", "")
