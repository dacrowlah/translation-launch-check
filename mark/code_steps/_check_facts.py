"""The facts "Read and check the file" hands on through the run folder (check.json): the
master lines and, per locale, its lines, flat rule findings and check statuses, plus the
locale checksum its review must echo. A rule finding that needs a second opinion from
Translation Review (an unsure finding, or a blocker on a value the tool reads per locale)
gets a ref: R1, R2, ... per locale, for at most as many as the review's schema admits answers
for (unsure findings first). The rest get no second opinion but still count, as unsent checks.
Nothing here raises."""

from _budgets import REVIEW_BOUNDS
from _checksum import locale_checksum
from _config import PRIVATE
from _csv_format import FIXED_COLUMNS
from _text_problems import header_problem, problem, shown, where_row
from _tool_report import flat_findings

VALUE_CHECKS = ("numbers", "currency_amount", "dates")  # notation can differ by locale
LANGUAGE_CHECKS = ("language_column", "language_line")


def needs_second_opinion(finding):
    unsure = finding["confidence"] == "unsure"
    return unsure or (finding["severity"] == "blocker" and finding["check"] in VALUE_CHECKS)


def _sent_indexes(findings):
    """The indexes of the findings sent for a second opinion, in line order."""
    flagged = [index for index, finding in enumerate(findings) if needs_second_opinion(finding)]
    ranked = sorted(flagged, key=lambda index: findings[index]["confidence"] != "unsure")
    return sorted(ranked[: REVIEW_BOUNDS["rule_checks"]])


def _with_refs(findings):
    refs = {index: f"R{number}" for number, index in enumerate(_sent_indexes(findings), 1)}
    return [{**finding, "ref": refs.get(index)} for index, finding in enumerate(findings)]


def unsent_checks(findings):
    """How many findings needed a second opinion but weren't sent for one."""
    return sum(needs_second_opinion(finding) and not finding["ref"] for finding in findings)


def master_lines(pkg):
    master = pkg["master_locale"]
    return [
        {**{key: line[key] for key in FIXED_COLUMNS}, "text": line["texts"][master]}
        for line in pkg["lines"]
    ]


def _locale_line(line, locale, tool_line):
    """The translation as sent, with the tool's length and code-made spelling fix."""
    found = {"length": tool_line.get("length"), "spelling_fix": tool_line.get("spelling_fix")}
    return {"id": line["id"], "text": line["texts"][locale], **found}


def _rule_facts(report):
    findings = _with_refs(flat_findings(report))
    return {"rule_findings": findings, "unsent_checks": unsent_checks(findings)}


def locale_facts(report, pkg):
    locale, by_id = report["locale"], {line["id"]: line for line in report["lines"]}
    lines = [_locale_line(line, locale, by_id.get(line["id"], {})) for line in pkg["lines"]]
    found = _rule_facts(report)
    head = dict(locale=locale, status=report["status"], lines=lines, checks=report["checks"])
    return dict(head, **found, checksum=locale_checksum(locale, lines, found["rule_findings"]))


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
