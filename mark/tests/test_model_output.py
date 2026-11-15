import json

import pytest

from _agent_output import agent_answer, agent_text
from _fix_input import within_cap
from _markdown import one_line
from _model_output import model_text
from builders import an_execution_record


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


ANSWER = {"locale": "de-DE", "checksum": "abc", "findings": [], "rule_checks": []}
RECORD_TEXT = an_execution_record(json.dumps(ANSWER, indent=2))


@pytest.mark.parametrize(
    "raw",
    [
        ANSWER,
        json.dumps(ANSWER),
        RECORD_TEXT,
        json.dumps(RECORD_TEXT),
        an_execution_record(ANSWER),
        {"token_usage": {}, "response": json.dumps(ANSWER)},
    ],
)
def test_agent_answer_finds_the_answer_in_every_form(raw):
    assert agent_answer(raw) == ANSWER


@pytest.mark.parametrize(
    "raw",
    [None, 7, "prose", "[1]", an_execution_record("prose"), an_execution_record(["x"])],
)
def test_agent_answer_is_none_without_an_answer_object(raw):
    assert agent_answer(raw) is None


def test_a_dict_with_a_response_but_no_record_keys_is_an_answer():
    assert agent_answer({"response": "{}", "locale": "de-DE"}) == {
        "response": "{}",
        "locale": "de-DE",
    }


@pytest.mark.parametrize(
    "raw",
    [
        "[L1] Up to 30%",
        an_execution_record("[L1] Up to 30%"),
        json.dumps(an_execution_record("[L1] Up to 30%")),
    ],
)
def test_agent_text_finds_the_text_in_every_form(raw):
    assert agent_text(raw) == "[L1] Up to 30%"


@pytest.mark.parametrize("raw", [None, 7, ["x"], ANSWER, an_execution_record(ANSWER)])
def test_agent_text_is_empty_without_text(raw):
    assert agent_text(raw) == ""
