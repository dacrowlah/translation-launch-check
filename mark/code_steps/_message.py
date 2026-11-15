"""The chat reply and the QA-inbox email: the overall verdict, one line per language, the
top fixes and the corrected file, the canvas link, what needs a human look, the rule, the
rules version and the footer. One assembly, two styles: MARKDOWN for chat (untrusted text
escaped by safe(), links as Markdown) and PLAIN for the email (untrusted text through
plain(), links as "Label: url"). All text from the templates. Bounded: top fixes and each
language's human-look items are capped. Nothing here raises."""

from _markdown import plain, safe
from _report_view import (
    closing_lines,
    fix_status_text,
    human_items,
    label,
    line_of,
    opinion_text,
    overall_line,
)
from _text_report import NOUNS, REPORT

MAX_TOP_FIXES = 3
MAX_HUMAN_ITEMS = 5  # per language; the canvas has them all
MARKDOWN = {"text": safe, "link": "markdown_link"}
PLAIN = {"text": plain, "link": "plain_link"}


def _link(style, label, text, url):
    return REPORT[style["link"]].format(label=label, text=text, url=url)


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


def _fix_line(fix, shown):
    template = REPORT["spelling_fix" if fix["kind"] == "spelling" else "fix"]
    named = {"locale": fix["locale"], "line": shown(fix["line_id"]), "text": shown(fix["text"])}
    return template.format(**named, status=fix_status_text(fix))


def _fixes_section(fixes, unfixed, shown):
    lines = [_fix_line(fix, shown) for fix in fixes[:MAX_TOP_FIXES]]
    top = [REPORT["top_fixes"], *lines] if fixes else []
    return top + ([REPORT["unfixed"].format(count=unfixed)] if unfixed else [])


def _unsent_section(count):
    return [REPORT["unsent"].format(count=count)] if count else []


def _corrected_link(corrected, style):
    key = "corrected_one" if corrected["applied"] == 1 else "corrected"
    label = REPORT[key].format(count=corrected["applied"])
    return _link(style, label, REPORT["download"], corrected["url"])


def corrected_section(corrected, style):
    """The corrected file's link and how many lines are left for a person; one line when the
    write failed; nothing when no fix passed (corrected is None)."""
    if not (corrected and corrected["url"]):
        return [REPORT["corrected_failed"]] if corrected else []
    left = _counted(corrected["open"], "open")
    return [_corrected_link(corrected, style), *([left] if left else [])]


def canvas_line(canvas, style):
    if not canvas["url"]:
        return REPORT["canvas_failed"]
    return _link(style, REPORT["canvas_label"], style["text"](canvas["name"]), canvas["url"])


def _copy_lines(line, shown):
    if line is None:
        return []
    master = REPORT["human_master"].format(text=shown(line["master"]))
    return [master, REPORT["human_translation"].format(text=shown(line["text"]))]


def _human_entry(scored, finding, shown):
    where = shown(finding["line_id"] or REPORT["whole_column"])
    named = {"line": where, "check": shown(finding["check"]), "question": shown(finding["detail"])}
    copy = _copy_lines(line_of(scored, finding["line_id"]), shown)
    opinion = REPORT["human_opinion"].format(opinion=shown(opinion_text(finding)))
    return [REPORT["human_item"].format(**named), *copy, opinion]


def _human_entries(scored, items, shown):
    first = items[:MAX_HUMAN_ITEMS]
    entries = [text for finding in first for text in _human_entry(scored, finding, shown)]
    more = len(items) - MAX_HUMAN_ITEMS
    return entries + ([REPORT["human_more"].format(count=more)] if more > 0 else [])


def human_block(scored, shown):
    entries = _human_entries(scored, human_items(scored), shown)
    return [REPORT["human_heading"].format(locale=scored["locale"]), *entries] if entries else []


def _joined(sections):
    return "\n\n".join("\n".join(section) for section in sections if section)


def _middle(scores, fixes, links, style):
    """The fixes and the corrected file, then the canvas link."""
    fixed = _fixes_section(fixes, scores["unfixed_lines"], style["text"])
    fixed += corrected_section(links.get("corrected"), style)
    canvas = [canvas_line(links["canvas"], style)]
    return [_unsent_section(scores["unsent_checks"]), fixed, canvas]


def message(scores, fixes, links, style=MARKDOWN):
    """Sections separated by blank lines, so Markdown keeps them apart. links: {"canvas",
    "corrected"}."""
    head = [[overall_line(scores)], [locale_line(scored) for scored in scores["locales"]]]
    humans = [human_block(scored, style["text"]) for scored in scores["locales"]]
    tail = [[line] for line in closing_lines(scores)]
    return _joined([*head, *_middle(scores, fixes, links, style), *humans, *tail])
