"""Each language's loop item: what its agents read and the checksum they echo, size-capped.
The review input holds each line's master and translation and the rule findings to
double-check; the back-translation input is one labelled line per entry. Nothing here
raises."""

from _budgets import input_budget, review_allowance
from _checksum import json_size
from _finding_text import length_text, values_text
from _text_problems import file_problem

# Caps in json_size bytes (escaped JSON, the largest form, as the platform may count it).
MAX_AGENT_INPUT_BYTES = 66_000  # one agent step's input; verified intact to about 72 KB
# The back-translation goes into "Save the review" next to the review: what that step's
# budget leaves after the largest review the schema admits and its small keys (run_key,
# locale, checksum).
MAX_ENGLISH_BYTES = input_budget("save_review") - review_allowance() - 200
MAX_ITEMS_BYTES = 240_000  # this step's return: 256 KB, and run_safely refuses over 250,000
DOUBLE_CHECK_HEADING = "Rule findings to double-check:"


def _line_block(master, line):
    head = f"[{master['id']}] {master['channel']}/{master['field']}"
    body = f"\nMaster: {master['text']}\nTranslation: {line['text']}"
    return head + body + length_text(line["length"])


def _double_check_line(finding):
    where = finding["line_id"] or "whole column"
    head = f"[{finding['ref']}] {where} ({finding['check']}): {finding['detail']}"
    return head + values_text(finding)


def _double_check_section(findings):
    flagged = [_double_check_line(finding) for finding in findings if finding["ref"]]
    return (
        "\n".join([DOUBLE_CHECK_HEADING, *flagged]) if flagged else DOUBLE_CHECK_HEADING + " none."
    )


def review_input(master_lines, facts):
    pairs = zip(master_lines, facts["lines"], strict=True)
    blocks = [_line_block(master, line) for master, line in pairs]
    return "\n\n".join([*blocks, _double_check_section(facts["rule_findings"])])


def back_translation_input(facts):
    """ "[L1] text" per line; line breaks inside a cell become spaces."""
    return "\n".join(
        f"[{line['id']}] {' '.join(line['text'].splitlines())}" for line in facts["lines"]
    )


def loop_item(master_lines, facts):
    inputs = {"review_input": review_input(master_lines, facts)}
    inputs["back_translation_input"] = back_translation_input(facts)
    return {"locale": facts["locale"], **inputs, "checksum": facts["checksum"]}


def _agent_input_too_large(item, english):
    """Content Translation reads the back-translation input; Translation Review reads the
    review input plus the back-translation, which comes back about as long as the master."""
    if json_size(item["back_translation_input"]) > MAX_AGENT_INPUT_BYTES:
        return True
    return json_size(item["review_input"]) + english > MAX_AGENT_INPUT_BYTES


def size_problems(items, master_lines):
    """[the "too large" problem] when an agent's input, the expected back-translation or
    this step's return would go over its budget. Each text counts where it is used, once."""
    english = json_size(back_translation_input({"lines": master_lines}))
    agents = english > MAX_ENGLISH_BYTES or any(_agent_input_too_large(i, english) for i in items)
    return [file_problem("too_large_run")] if agents or json_size(items) > MAX_ITEMS_BYTES else []
