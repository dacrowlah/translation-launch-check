"""What the chat reply and the canvas both show, from the scores: the overall line, verdict
labels, the items that need a human look (open unsure findings), the reviewer's opinion, a
fix's re-check status and the closing lines. Untrusted text is made safe by the caller:
safe() in the chat reply, cell() in the canvas. Nothing here raises."""

from _markdown import md_text
from _text_report import FIX_STATUS, LABELS, OPINION_LABELS, REPORT

MAX_SHOWN = 200  # characters of copy per line in the chat reply


def label(verdict):
    return LABELS.get(verdict, LABELS["check_incomplete"])


def one_line(text, limit=MAX_SHOWN):
    """Copy as one short line: whitespace collapsed, cut at `limit` with an ellipsis."""
    flat = " ".join(str(text).split()) if text is not None else ""
    return flat if len(flat) <= limit else flat[: limit - 3].rstrip() + "..."


def safe(text, limit=MAX_SHOWN):
    """Untrusted text for the chat reply and the email: one short line, Markdown escaped."""
    return md_text(one_line(text, limit))


def overall_line(scores):
    outcome, locales = scores["outcome"], scores["locales"]
    count = sum(1 for scored in locales if scored["verdict"] == outcome)
    return REPORT["overall_" + outcome].format(count=count, total=len(locales))


def human_items(scored):
    """Open unsure findings: the tool couldn't tell, so a person decides."""
    return [finding for finding in scored["findings"] if finding["confidence"] == "unsure"]


def line_of(scored, line_id):
    return next((line for line in scored["lines"] if line["id"] == line_id), None)


def opinion_text(finding):
    """The reviewer's opinion and reason, unescaped (the reason is model text)."""
    if not finding.get("opinion"):
        return ""
    reason = REPORT["reason"].format(reason=finding["reason"]) if finding["reason"] else ""
    return OPINION_LABELS[finding["opinion"]] + reason


def fix_status_text(fix):
    return FIX_STATUS[fix["status"]].format(checks=", ".join(fix["checks"]))


def closing_lines(scores):
    version = scores["rules_version"]
    rules = REPORT["rules_version"].format(
        version=version["version"], date=version["effective_date"]
    )
    return [REPORT["rule"], rules, REPORT["footer"]]
