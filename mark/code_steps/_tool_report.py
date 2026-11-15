"""The tool's LocalizationReport (docs/contract/TOOL_CONTRACT.md section 3), checked before
anything trusts it, and read into flat findings. A report of the wrong shape counts as the
tool failing: our side, never the user's file. Nothing here raises."""

from _config import RULES

LOCALE_STATUSES = ("checked", "unsupported_locale")
FINDING_FIELDS = ("check", "severity", "detail", "expected", "found")


def _dicts(values):
    return isinstance(values, list) and all(isinstance(value, dict) for value in values)


def _report_line_ok(line):
    return isinstance(line.get("id"), str) and _dicts(line.get("findings"))


def _report_locale_ok(report, locale):
    """Its locale and status, and lists of line and column findings and a checks map."""
    get = report.get if isinstance(report, dict) else {}.get
    named = get("locale") == locale and get("status") in LOCALE_STATUSES
    lines, columns = get("lines"), get("column_findings")
    listed = named and _dicts(lines) and _dicts(columns) and isinstance(get("checks"), dict)
    return listed and all(_report_line_ok(line) for line in lines)


def _rules_ok(rules):
    fields = ("version", "effective_date")
    return isinstance(rules, dict) and all(isinstance(rules.get(key), str) for key in fields)


def _reports(body, locales):
    reports = body.get("locales") if isinstance(body, dict) else None
    ok = _dicts(reports) and len(reports) == len(locales) and _rules_ok(body.get("rules"))
    return reports if ok else None


def usable_report(body, locales):
    """True when the body has the rules version, the master and one locale report per
    requested locale, in order."""
    reports = _reports(body, locales)
    if reports is None:
        return False
    each = all(_report_locale_ok(r, c) for r, c in zip(reports, locales, strict=True))
    return each and _report_locale_ok(body.get("master"), RULES["master_locale"])


def _flat_finding(finding, line_id):
    """One finding as the workflow keeps it. confidence: the tool's optional field, certain
    when absent; any value other than "certain" counts as unsure (fail closed)."""
    kept = {field: finding.get(field) for field in FINDING_FIELDS}
    certain = finding.get("confidence", "certain") == "certain"
    return {"line_id": line_id, **kept, "confidence": "certain" if certain else "unsure"}


def flat_findings(report):
    """Column findings (line_id None), then each line's findings, in the tool's order."""
    columns = [_flat_finding(each, None) for each in report["column_findings"]]
    lines = (line for line in report["lines"])
    return columns + [
        _flat_finding(each, line["id"]) for line in lines for each in line["findings"]
    ]
