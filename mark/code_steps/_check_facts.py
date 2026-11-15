"""The facts "Read and check the file" hands on through the run folder (check.json): the
master lines and, per locale, its lines, flat rule findings and check statuses, plus the
locale checksum its review must echo. A rule finding that needs a second opinion from
Translation Review (an unsure finding, or a blocker on a value the tool reads per locale)
gets a ref: R1, R2, ... per locale. Nothing here raises."""

from _checksum import locale_checksum
from _config import PRIVATE
from _text_problems import header_problem, problem, shown, where_row
from _tool_report import flat_findings

VALUE_CHECKS = ("numbers", "currency_amount", "dates")  # notation can differ by locale
LANGUAGE_CHECKS = ("language_column", "language_line")


def needs_second_opinion(finding):
    unsure = finding["confidence"] == "unsure"
    return unsure or (finding["severity"] == "blocker" and finding["check"] in VALUE_CHECKS)


def _with_refs(findings):
    flagged = [index for index, finding in enumerate(findings) if needs_second_opinion(finding)]
    refs = {index: f"R{number}" for number, index in enumerate(flagged, 1)}
    return [{**finding, "ref": refs.get(index)} for index, finding in enumerate(findings)]


def master_lines(pkg):
    master = pkg["master_locale"]
    fields = ("id", "channel", "field")
    return [
        {**{key: line[key] for key in fields}, "text": line["texts"][master]}
        for line in pkg["lines"]
    ]


def _locale_line(line, locale, tool_line):
    """The translation as sent, with the tool's length and code-made spelling fix."""
    found = {"length": tool_line.get("length"), "spelling_fix": tool_line.get("spelling_fix")}
    return {"id": line["id"], "text": line["texts"][locale], **found}


def locale_facts(report, pkg):
    locale, by_id = report["locale"], {line["id"]: line for line in report["lines"]}
    lines = [_locale_line(line, locale, by_id.get(line["id"], {})) for line in pkg["lines"]]
    findings = _with_refs(flat_findings(report))
    facts = dict(locale=locale, status=report["status"], lines=lines, checks=report["checks"])
    return dict(facts, rule_findings=findings, checksum=locale_checksum(locale, lines, findings))


def check_facts(pkg, body, source):
    """Everything later steps need, in one file. Webhook runs report to the QA inbox; chat
    runs have no verified requester identity, so they get no email."""
    rules = {key: body["rules"][key] for key in ("version", "effective_date")}
    top = {"campaign": pkg["campaign"], "source": source, "rules_version": rules}
    notify = PRIVATE["qa_inbox"] if source == "webhook" else None
    locales = [locale_facts(report, pkg) for report in body["locales"]]
    return {**top, "notify_email": notify, "master_lines": master_lines(pkg), "locales": locales}


def _master_problem(finding, pkg):
    if finding["line_id"] is None:
        return header_problem("master_not_english")
    ids = [line["id"] for line in pkg["lines"]]
    row = ids.index(finding["line_id"]) + 2 if finding["line_id"] in ids else 0
    return problem(where_row(row), "master_line_not_english", line=shown(finding["line_id"]))


def master_problems(body, pkg):
    """A certain language finding on the en-US master: review compares in English, so a
    master that isn't English can't be checked. An unsure one is no problem."""
    certain = (f for f in flat_findings(body["master"]) if f["confidence"] == "certain")
    return [_master_problem(f, pkg) for f in certain if f["check"] in LANGUAGE_CHECKS]
