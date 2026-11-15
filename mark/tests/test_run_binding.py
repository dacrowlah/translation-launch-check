import pytest

from _run_folder import read_review, read_verified, write_run_file
from builders import LOCALE_CHECKSUM, RUN_DATA, RUN_DATA_CHECKSUM, RUN_KEY, a_failed_read

REVIEW = {"locale": "de-DE", "checksum": LOCALE_CHECKSUM, "findings": []}
REVIEW_CHECKSUM = "4cf135f684643024"  # the stored file's own checksum of REVIEW


def _review(tmp_path, review, locale="de-DE"):
    assert write_run_file(RUN_KEY, f"reviews/{locale}.json", review, root=tmp_path) == "ok"
    return read_review(RUN_KEY, locale, LOCALE_CHECKSUM, root=tmp_path)


def test_read_verified_accepts_the_handed_over_checksum(tmp_path):
    assert write_run_file(RUN_KEY, "rules.json", RUN_DATA, root=tmp_path) == "ok"
    found = read_verified(RUN_KEY, "rules.json", RUN_DATA_CHECKSUM, root=tmp_path)
    assert found == {"status": "ok", "data": RUN_DATA, "checksum": RUN_DATA_CHECKSUM}


@pytest.mark.parametrize("handed_over", ["0000000000000000", "", None, 2511, [RUN_DATA_CHECKSUM]])
def test_read_verified_fails_closed_on_any_other_value(tmp_path, handed_over):
    assert write_run_file(RUN_KEY, "rules.json", RUN_DATA, root=tmp_path) == "ok"
    assert read_verified(RUN_KEY, "rules.json", handed_over, root=tmp_path) == a_failed_read()


def test_read_verified_passes_a_bad_path_through(tmp_path):
    found = read_verified("../x", "rules.json", RUN_DATA_CHECKSUM, root=tmp_path)
    assert found["status"] == "invalid_path"


def test_read_verified_is_not_checked_for_a_missing_file(tmp_path):
    assert read_verified(RUN_KEY, "rules.json", RUN_DATA_CHECKSUM, root=tmp_path) == a_failed_read()


def test_read_review_accepts_the_echoed_locale_checksum(tmp_path):
    found = _review(tmp_path, REVIEW)
    assert found == {"status": "ok", "data": REVIEW, "checksum": REVIEW_CHECKSUM}


@pytest.mark.parametrize(
    "review",
    [
        {**REVIEW, "checksum": "0000000000000000"},
        {"locale": "de-DE", "findings": []},
        {**REVIEW, "checksum": None},
        {**REVIEW, "locale": "de-CH"},
        {"checksum": LOCALE_CHECKSUM, "findings": []},
        [LOCALE_CHECKSUM, "de-DE"],
        LOCALE_CHECKSUM,
        None,
    ],
)
def test_read_review_fails_closed_without_the_echo(tmp_path, review):
    assert _review(tmp_path, review) == a_failed_read()


@pytest.mark.parametrize("echo", [None, "", 5, [LOCALE_CHECKSUM]])
def test_read_review_needs_a_non_empty_string_to_match(tmp_path, echo):
    review = {**REVIEW, "checksum": echo}
    assert write_run_file(RUN_KEY, "reviews/de-DE.json", review, root=tmp_path) == "ok"
    assert read_review(RUN_KEY, "de-DE", echo, root=tmp_path) == a_failed_read()


@pytest.mark.parametrize("locale", ["../de-DE", "de-DE/../../x", "de-de", None, 7])
def test_read_review_refuses_a_bad_locale(tmp_path, locale):
    assert read_review(RUN_KEY, locale, LOCALE_CHECKSUM, root=tmp_path)["status"] == "invalid_path"


def test_read_review_is_not_checked_for_a_missing_file(tmp_path):
    assert read_review(RUN_KEY, "fr-FR", LOCALE_CHECKSUM, root=tmp_path) == a_failed_read()
