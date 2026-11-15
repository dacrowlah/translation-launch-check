import needs_info

TEMPLATE = "Template: [CSV template](https://example.com/translation-launch-check/template.csv)"
HEADER = {"where": "header", "message": "Column jp isn't a supported locale."}
ROW = {"where": "row 2", "message": "L1 has no jp text."}
PROBLEMS = [
    {**HEADER, "suggestion": "Did you mean ja-JP?"},
    {**ROW, "suggestion": "Fill in every cell, or delete the row."},
    {"where": "", "message": "Something went wrong on our side. Please re-run.", "suggestion": ""},
]


def test_needs_info_lists_every_problem_and_links_the_template(fake_tools):
    out = needs_info.handler({"problems": PROBLEMS, "campaign": "Sale"}, {})
    assert out["message"] == (
        "Your file needs a few changes before it can be checked:\n"
        "- header: Column jp isn't a supported locale. Did you mean ja-JP?\n"
        "- row 2: L1 has no jp text. Fill in every cell, or delete the row.\n"
        "- Something went wrong on our side. Please re-run.\n\n" + TEMPLATE
    )
    assert (
        out["summary"] == "Asked for a corrected file; problems listed: 3."
        and fake_tools.calls == []
    )


def test_malformed_problems_are_skipped(fake_tools):
    given = [PROBLEMS[1], "row 3: bad", {"where": "row 4"}, {"message": 5}]
    lines = needs_info.handler({"problems": given}, {})["message"].splitlines()
    assert lines[1:] == [
        "- row 2: L1 has no jp text. Fill in every cell, or delete the row.",
        "",
        TEMPLATE,
    ]


def test_no_usable_problem_still_answers_with_the_template(fake_tools):
    out = needs_info.handler({"problems": "none"}, {})
    assert (
        out["message"]
        == "Your file couldn't be checked. Compare it with the template.\n\n" + TEMPLATE
    )


def test_each_field_is_one_short_line():
    long = {"where": "row\n2", "message": "x" * 400, "suggestion": "a\u2028b"}
    line = needs_info.handler({"problems": [long]}, {})["message"].splitlines()[1]
    assert line == "- row 2: " + "x" * 297 + "... a b"


def test_prints_nothing_and_never_fails(capsys):
    assert needs_info.handler(None, {})["message"].startswith("Your file couldn't be checked.")
    assert capsys.readouterr() == ("", "")


def test_our_side_failures_get_a_neutral_line_and_no_template(fake_tools):
    tool_down = (
        "Couldn't run the checks right now. Your file wasn't the problem; re-run in a few minutes."
    )
    out = needs_info.handler(
        {"problems": [{"where": "file", "message": tool_down, "suggestion": ""}]}, {}
    )
    assert out == {
        "message": "We couldn't check your file right now; please try again.",
        "summary": "The checks couldn't run.",
    }


def test_a_file_value_in_a_problem_shows_as_text():
    problem = {
        "where": "header",
        "message": "Column [x](https://evil.example) isn't a supported locale.",
        "suggestion": "",
    }
    line = needs_info.handler({"problems": [problem]}, {})["message"].splitlines()[1]
    assert line == "- header: Column \\[x\\]\\(https://evil.example\\) isn't a supported locale."
