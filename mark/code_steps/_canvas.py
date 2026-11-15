"""The canvas: the detailed Markdown report. Per language: what needs a human look, every
finding, every line with its suggested fix and re-check, and the back-translation; then the
same rule, rules version and footer as the chat reply. Every value from the file, the tool
or a model goes through cell(), which builds on md_text(): Markdown and HTML render as text,
"|" can't break a table, and format and control characters are removed. Nothing here
raises."""

from _loop_items import length_value
from _markdown import md_text
from _report_view import (
    closing_lines,
    fix_status_text,
    human_items,
    label,
    line_of,
    opinion_text,
    overall_line,
)
from _text_report import CANVAS, REPORT


def cell(text):
    """One table cell or inline value: line breaks become " / ", then md_text()."""
    return md_text(" / ".join(("" if text is None else str(text)).splitlines()))


def _table_row(values):
    return "| " + " | ".join(cell(value) for value in values) + " |"


def _back_translated(scored, line_id):
    """The back-translation's own line for line_id ("[L2] ..."), or ""."""
    lines = (scored["back_translation"] or "").splitlines()
    return next((text for text in lines if text.startswith(f"[{line_id}]")), "")


def _human_details(scored, finding):
    line = line_of(scored, finding["line_id"])
    values = [line["master"], line["text"], _back_translated(scored, line["id"])] if line else []
    names = CANVAS["human_names"]
    return [*zip(names, values, strict=False), (names[-1], opinion_text(finding))]


def _canvas_human_entry(scored, finding):
    where = cell(finding["line_id"] or REPORT["whole_column"])
    named = {"line": where, "check": cell(finding["check"]), "question": cell(finding["detail"])}
    details = _human_details(scored, finding)
    lines = [CANVAS["human_detail"].format(name=name, text=cell(text)) for name, text in details]
    return [CANVAS["human_item"].format(**named), *lines]


def _human_part(scored):
    entries = [
        text for finding in human_items(scored) for text in _canvas_human_entry(scored, finding)
    ]
    return ["", CANVAS["human"], *entries] if entries else []


def _finding_row(finding):
    where = finding["line_id"] or REPORT["whole_column"]
    values = (finding["source"], finding["check"], finding["severity"], finding["detail"])
    return _table_row(
        [where, *values, finding["expected"], finding["found"], opinion_text(finding)]
    )


def _findings_part(scored):
    rows = [_finding_row(finding) for finding in scored["findings"]]
    if not rows:
        return ["", CANVAS["findings"], CANVAS["no_findings"]]
    return ["", CANVAS["findings"], CANVAS["findings_head"], CANVAS["findings_rule"], *rows]


def _fix_for(fixes, scored, line):
    key = (scored["locale"], line["id"])
    return next((fix for fix in fixes if (fix["locale"], fix["line_id"]) == key), None)


def _fix_cells(fix):
    if fix is None:
        return ["", ""]
    kind = CANVAS["spelling_kind"] if fix["kind"] == "spelling" else ""
    return [fix["text"] + kind, fix_status_text(fix)]


def _line_row(scored, line, fixes):
    named = [line["id"], f"{line['channel']}/{line['field']}", line["master"], line["text"]]
    fix = _fix_cells(_fix_for(fixes, scored, line))
    return _table_row([*named, length_value(line["length"]), *fix])


def _lines_part(scored, fixes):
    rows = [_line_row(scored, line, fixes) for line in scored["lines"]]
    return ["", CANVAS["lines"], CANVAS["lines_head"], CANVAS["lines_rule"], *rows]


def _back_translation_part(scored):
    text = scored["back_translation"]
    quoted = ["> " + cell(line) for line in text.splitlines() if line.strip()] if text else []
    return ["", CANVAS["back_translation"], *(quoted or [CANVAS["no_back_translation"]])]


def _locale_head(scored):
    head = [CANVAS["locale"].format(locale=scored["locale"], label=label(scored["verdict"]))]
    head += [CANVAS["not_checked"]] if scored["not_checked"] else []
    unmatched = scored["unmatched_notes"]
    return head + ([CANVAS["unmatched"].format(count=unmatched)] if unmatched else [])


def _locale_section(scored, fixes):
    parts = _human_part(scored) + _findings_part(scored) + _lines_part(scored, fixes)
    return _locale_head(scored) + parts + _back_translation_part(scored)


def render(scores, fixes, run_time):
    title = CANVAS["title"].format(campaign=cell(scores["campaign"]))
    head = [title, "", overall_line(scores), "", CANVAS["run"].format(run_time=run_time)]
    locales = [_locale_section(scored, fixes) for scored in scores["locales"]]
    closing = [[line] for line in closing_lines(scores)]  # one paragraph each, as in the chat
    return "\n\n".join("\n".join(section) for section in [head, *locales, *closing])
