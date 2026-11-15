import pytest

from _fix_input import within_cap
from _model_output import model_text
from _report_view import one_line


def test_model_text_keeps_500_characters():
    assert model_text("x" * 500) == "x" * 500 and model_text(" " + "y" * 501 + " ") == "y" * 500


@pytest.mark.parametrize("value", [None, 7, ["x"]])
def test_model_text_is_empty_for_anything_but_text(value):
    assert model_text(value) == ""


def test_one_line_keeps_200_characters_and_cuts_with_an_ellipsis():
    assert one_line("x" * 200) == "x" * 200 and one_line("x" * 201) == "x" * 197 + "..."


def an_entry(master_size):
    names = {"locale": "de-DE", "line_id": "L1", "channel": "email", "field": "body"}
    texts = {"master": "x" * master_size, "text": "y", "start_text": "y"}
    return {**names, **texts, "length": None, "findings": []}


def test_the_fixer_cap_includes_a_line_that_fits_exactly():
    # "[de-DE L1] email/body\nMaster: <m>\nTranslation: y\nProblems:" is 55 + m characters;
    # as JSON, 2 quotes and 3 escaped line breaks add 5: 50,000 at m = 49,940.
    assert within_cap([an_entry(49_940)]) == [an_entry(49_940)]
    assert within_cap([an_entry(49_941)]) == []
