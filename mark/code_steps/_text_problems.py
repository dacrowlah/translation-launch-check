"""Templates for the problems a rejected file gets: key -> (message, suggestion). Values are
filled with str.format, so a value from the file is never parsed as a template."""

from _routes import defused
from _text import TEXT

SAVE_AS_UTF8 = "Save it as CSV UTF-8 and attach it again."
SPLIT_ROWS = "Split it by rows into smaller files."
RESEND = "Send the package again."
FILL_IN = "Fill in every cell, or delete the row."

SHOWN_CHARS = 40  # a value from the file is echoed at most this long
MAX_SHOWN_PROBLEMS = 25  # problems handed to "Ask for a corrected file"; the rest are counted
PROBLEM_WHERE = {"file": "file", "header": "header", "row": "row {number}"}
PROBLEM_LABELS = {"row": "Row {number}", "campaign": "The campaign name"}

PROBLEMS = {
    "too_large_file": ("The file is larger than {limit_kb} KB.", SPLIT_ROWS),
    "not_utf8": ("The file isn't UTF-8 text.", SAVE_AS_UTF8),
    "nul": ("The file contains a NUL character.", SAVE_AS_UTF8),
    "not_csv": ("The file couldn't be read as CSV.", "Compare it with the template."),
    "empty_file": ("The file is empty.", "Start from the template."),
    "bad_header": (
        "The header must start with id, channel and field, then en-US and the translations.",
        "Copy the header row from the template.",
    ),
    "no_targets": ("The file has no translation columns.", "Add a column such as de-DE."),
    "too_many_targets": ("The file has {count} translation columns; the limit is {limit}.", ""),
    "bad_master": ("The first locale column must be {master}, not {found}.", ""),
    "master_repeated": ("Column {master} is the master; list it only once.", ""),
    "duplicate_locale": ("Column {locale} appears more than once.", ""),
    "unknown_locale": ("Column {locale} isn't a supported locale.", "Did you mean {suggestion}?"),
    "unknown_locale_list": ("Column {locale} isn't a supported locale.", "Use one of: {known}."),
    "row_cells": ("Row {row} has {count} cells; the header has {width}.", FILL_IN),
    "no_lines": ("The file has no rows to check.", "Add at least one row of copy."),
    "too_many_lines": ("The file has {count} rows; the limit is {limit}.", SPLIT_ROWS),
    "no_id": ("Row {row} needs an id of 1-40 characters.", "Give every row an id such as L1."),
    "duplicate_id": ("The id {line} is used more than once.", "Give every row a unique id."),
    "unknown_pair": ("{line}: {pair} isn't a known channel and field.", "Use one of: {known}."),
    "empty_cell": ("{line} has no {locale} text.", FILL_IN),
    "nul_cell": ("{line}'s {locale} text contains a NUL character.", "Remove it."),
    "long_cell": ("{line}'s {locale} text is longer than {limit} characters.", SPLIT_ROWS),
    "reserved_word": ('{line} contains the reserved word "tlc_route".', "Remove it."),
    "blank_column": ("Column {number} has no locale name.", "Name it, such as de-DE."),
    "blank_row": ("Row {row} is empty.", "Delete the row."),
    "question_marks": (
        "{line}'s {locale} text is mostly question marks: the file was probably saved in the "
        "wrong encoding.",
        SAVE_AS_UTF8,
    ),
    "bad_campaign": ("The campaign name must be text.", RESEND),
    "too_large_run": ("The file is too large to check in one run.", SPLIT_ROWS),
    "attach_one": ("Attach exactly one localization CSV.", "Attach the file in Mark chat."),
    "email_not_supported": (
        "Email can't carry the file yet.",
        "Attach the file in Mark chat instead.",
    ),
    "changed_in_transit": ("The package changed in transit.", RESEND),
    "bad_package": ("The package doesn't have the expected fields.", RESEND),
    "more_problems": ("...and {count} more problems.", "Fix the ones above and check again."),
    "tool_down": (
        "Couldn't run the checks right now. Your file wasn't the problem; re-run in a few minutes.",
        "",
    ),
    "internal": (TEXT["internal_error"], ""),
    "master_not_english": ("The en-US column doesn't read as English.", ""),
    "master_line_not_english": ("Line {line} of the en-US master doesn't read as English.", ""),
}


def problem(where, key, **values):
    """{where, message, suggestion} for one problem, from PROBLEMS[key]."""
    message, suggestion = PROBLEMS[key]
    filled = {"message": message.format(**values), "suggestion": suggestion.format(**values)}
    return {"where": where, **filled}


def shown(value):
    """A file value as echoed in a message: one line, at most SHOWN_CHARS characters, the
    route prefix defused (the message reaches the output a condition reads)."""
    return defused(" ".join(str(value).split())[:SHOWN_CHARS])


def where_row(number):
    return PROBLEM_WHERE["row"].format(number=number)


def label_row(number):
    return PROBLEM_LABELS["row"].format(number=number)


def our_side(problems):
    """True when every problem is ours (the tool or the platform failed), not the file's."""
    ours = {PROBLEMS["tool_down"][0], PROBLEMS["internal"][0]}
    messages = [each.get("message") if isinstance(each, dict) else None for each in problems]
    return bool(messages) and all(message in ours for message in messages)


def file_problem(key, **values):
    return problem(PROBLEM_WHERE["file"], key, **values)


def header_problem(key, **values):
    return problem(PROBLEM_WHERE["header"], key, **values)
