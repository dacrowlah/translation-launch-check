"""Package rules shared by every source (CSV and webhook): validate_package reports every
problem at once, each from the templates. `where` names the spreadsheet row (the header is
row 1). The package's shape (strings, lists, dicts) is checked before: the CSV parser builds
it, and the webhook path checks it first. Nothing here raises."""

from _locales import locale_problems
from _routes import has_route_word
from _text_problems import PROBLEM_LABELS, file_problem, label_row, problem, shown, where_row

MAX_ID_CHARS = 40  # the tool's bound on id, channel and field
MIN_QUESTION_MARKS = 3  # with half the visible characters: an encoding that dropped letters
# Mark decodes a non-UTF-8 chat attachment as Windows-1252 (verified): multibyte text such as
# Shift_JIS Japanese arrives as U+0080-U+00FF and these characters. A cell is garbled with at
# least MIN_GARBLED of them, GARBLED_PERCENT of its visible characters, and one marker: a
# character real copy doesn't use (dense French or German reaches the share without one).
CP1252_EXTRAS = frozenset(
    "\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192\u02c6\u02dc\u2013\u2014\u2018\u2019"
    "\u201a\u201c\u201d\u201e\u2020\u2021\u2022\u2026\u2030\u2039\u203a\u20ac\u2122"
)
CP1252_MARKERS = frozenset("\u0192\u201a\u2030\u02c6\u02dc\u2020\u2021")  # and U+0080-U+009F
MIN_GARBLED = 5
GARBLED_PERCENT = 30


def channel_pairs(rules):
    return [f"{entry['channel']}/{entry['field']}" for entry in rules["channels"]]


def _campaign_problems(pkg):
    if not has_route_word(pkg["campaign"]):
        return []
    return [file_problem("reserved_word", line=PROBLEM_LABELS["campaign"])]


def _row(line, number):
    label = shown(line["id"]) or label_row(number)
    return {"line": line, "number": number, "where": where_row(number), "label": label}


def _row_strings(line):
    return [line["id"], line["channel"], line["field"], *line["texts"].values()]


def _id_problem(row, pkg):
    line_id, number = row["line"]["id"], row["number"]
    if not line_id.strip() or len(line_id) > MAX_ID_CHARS:
        return problem(row["where"], "no_id", row=number)
    earlier = [line["id"] for line in pkg["lines"][: number - 2]]
    return problem(row["where"], "duplicate_id", line=row["label"]) if line_id in earlier else None


def _pair_problem(row, rules):
    line, known = row["line"], channel_pairs(rules)
    pair = f"{line['channel']}/{line['field']}"
    named = {"line": row["label"], "pair": shown(pair), "known": ", ".join(known)}
    return None if pair in known else problem(row["where"], "unknown_pair", **named)


def _reserved_problem(row):
    if not any(has_route_word(text) for text in _row_strings(row["line"])):
        return None
    return problem(row["where"], "reserved_word", line=label_row(row["number"]))


def _question_marks(text):
    """Mostly "?": what a spreadsheet writes for letters its encoding can't hold."""
    marks, visible = text.count("?"), sum(1 for char in text if not char.isspace())
    return marks >= MIN_QUESTION_MARKS and 2 * marks >= visible


def _cp1252_char(char):
    return "\x80" <= char <= "\xff" or char in CP1252_EXTRAS


def _marker(char):
    return "\x80" <= char <= "\x9f" or char in CP1252_MARKERS


def _garbled(text):
    """Multibyte text decoded as Windows-1252 (mojibake), by the rule above."""
    visible = [char for char in text if not char.isspace()]
    odd = sum(map(_cp1252_char, visible))
    share = 100 * odd >= GARBLED_PERCENT * len(visible)
    return odd >= MIN_GARBLED and share and any(map(_marker, visible))


def _text_issue(text):
    if "\x00" in text:
        return "nul_cell"
    if _question_marks(text):
        return "question_marks"
    return "garbled_cell" if _garbled(text) else None


def _cell_issue(text, limit):
    if not text.strip():
        return "empty_cell"
    return _text_issue(text) or ("long_cell" if len(text) > limit else None)


def _cell_problem(row, locale, limit):
    named = {"line": row["label"], "locale": shown(locale), "limit": limit}
    issue = _cell_issue(row["line"]["texts"].get(locale, ""), limit)
    return problem(row["where"], issue, **named) if issue else None


def _filled_row_problems(row, pkg, rules):
    limit, locales = rules["limits"]["max_cell_chars"], [pkg["master_locale"], *pkg["locales"]]
    cells = [_cell_problem(row, locale, limit) for locale in locales]
    found = [_id_problem(row, pkg), _pair_problem(row, rules), *cells, _reserved_problem(row)]
    return [each for each in found if each]


def _row_problems(row, pkg, rules):
    """A row left blank is one problem; otherwise every problem the row has."""
    if any(text.strip() for text in _row_strings(row["line"])):
        return _filled_row_problems(row, pkg, rules)
    return [problem(row["where"], "blank_row", row=row["number"])]


def _all_rows(pkg, rules):
    rows = (_row(line, index + 2) for index, line in enumerate(pkg["lines"]))
    return [each for row in rows for each in _row_problems(row, pkg, rules)]


def _line_problems(pkg, rules):
    lines, limit = pkg["lines"], rules["limits"]["max_lines"]
    if not lines:
        return [file_problem("no_lines")]
    too_many = file_problem("too_many_lines", count=len(lines), limit=limit)
    return [too_many] if len(lines) > limit else _all_rows(pkg, rules)


def validate_package(pkg, rules):
    """Every problem with the locales, the campaign name and the lines, in that order."""
    return locale_problems(pkg, rules) + _campaign_problems(pkg) + _line_problems(pkg, rules)
