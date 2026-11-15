"""The chat reply, which is also the QA-inbox email: the overall verdict, one line per
language, the top fixes, the canvas link, what needs a human look, the rule, the rules
version and the footer. All text from the templates; every untrusted value through safe().
Bounded: top fixes and each language's human-look items are capped. Nothing here raises."""

from _report_view import (
    closing_lines,
    fix_status_text,
    human_items,
    label,
    line_of,
    opinion_text,
    overall_line,
    safe,
)
from _text_report import NOUNS, REPORT

MAX_TOP_FIXES = 3
MAX_HUMAN_ITEMS = 5  # per language; the canvas has them all


def _certain(scored, severity):
    """Certain findings only: an unsure one is counted as "needs a human look"."""
    return [
        f for f in scored["findings"] if f["severity"] == severity and f["confidence"] == "certain"
    ]


def _count(scored, severity):
    count = len(_certain(scored, severity))
    return REPORT["count"].format(count=count, noun=NOUNS[severity][count != 1]) if count else ""


def _counted(count, key):
    if count < 2:
        return REPORT[key + "_one"] if count else ""
    return REPORT[key].format(count=count)


def _notes(scored):
    humans = _counted(len(human_items(scored)), "human_count")
    return humans + _counted(scored["unmatched_notes"], "unmatched")


def locale_line(scored):
    counts = [part for part in (_count(scored, "blocker"), _count(scored, "warning")) if part]
    shown = REPORT["counts"].format(counts=", ".join(counts)) if counts else ""
    head = REPORT["locale"].format(locale=scored["locale"], label=label(scored["verdict"]))
    return head + shown + _notes(scored)


def _fix_line(fix):
    template = REPORT["spelling_fix" if fix["kind"] == "spelling" else "fix"]
    named = {"locale": fix["locale"], "line": safe(fix["line_id"]), "text": safe(fix["text"])}
    return template.format(**named, status=fix_status_text(fix))


def _fixes_section(fixes, unfixed):
    top = [REPORT["top_fixes"], *map(_fix_line, fixes[:MAX_TOP_FIXES])] if fixes else []
    return top + ([REPORT["unfixed"].format(count=unfixed)] if unfixed else [])


def canvas_line(canvas):
    if not canvas["url"]:
        return REPORT["canvas_failed"]
    return REPORT["canvas_link"].format(name=safe(canvas["name"]), url=canvas["url"])


def _copy_lines(line):
    if line is None:
        return []
    master = REPORT["human_master"].format(text=safe(line["master"]))
    return [master, REPORT["human_translation"].format(text=safe(line["text"]))]


def _human_entry(scored, finding):
    where = safe(finding["line_id"] or REPORT["whole_column"])
    named = {"line": where, "check": safe(finding["check"]), "question": safe(finding["detail"])}
    copy = _copy_lines(line_of(scored, finding["line_id"]))
    opinion = REPORT["human_opinion"].format(opinion=safe(opinion_text(finding)))
    return [REPORT["human_item"].format(**named), *copy, opinion]


def _human_entries(scored, items):
    shown = [text for finding in items[:MAX_HUMAN_ITEMS] for text in _human_entry(scored, finding)]
    more = len(items) - MAX_HUMAN_ITEMS
    return shown + ([REPORT["human_more"].format(count=more)] if more > 0 else [])


def human_block(scored):
    entries = _human_entries(scored, human_items(scored))
    return [REPORT["human_heading"].format(locale=scored["locale"]), *entries] if entries else []


def _joined(sections):
    return "\n\n".join("\n".join(section) for section in sections if section)


def message(scores, fixes, canvas):
    """Sections separated by blank lines, so Markdown keeps them apart."""
    head = [[overall_line(scores)], [locale_line(scored) for scored in scores["locales"]]]
    links = [_fixes_section(fixes, scores["unfixed_lines"]), [canvas_line(canvas)]]
    humans = [human_block(scored) for scored in scores["locales"]]
    return _joined([*head, *links, *humans, *([line] for line in closing_lines(scores))])
