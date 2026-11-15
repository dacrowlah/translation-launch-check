"""Translation Review's answer, as saved by "Save the review": parsed, then bound to its
language. A review counts only if it is a JSON object (or JSON text of one, never fenced or
wrapped), names its locale, echoes the locale's checksum and has only well-formed findings;
otherwise the language is not checked (check_incomplete). Its second opinions on the rule
findings (rule_checks) only annotate: a missing or malformed one counts as cannot_tell.
Nothing here raises."""

import re

from _model_output import json_object, model_text
from _routes import defused
from _verdict import SEVERITIES

OPINIONS = ("real_problem", "same_meaning", "cannot_tell")
REVIEW_CHECK = re.compile(r"[a-z_]{1,40}")  # meaning, claim, tone, idiom, untranslated, ...


def parse_review(raw):
    return json_object(raw)


def _finding_ok(finding):
    """Well-formed apart from its line id; anything else drops the whole review (an unknown
    severity could hide a blocker)."""
    if not isinstance(finding, dict):
        return False
    check, severity = finding.get("check"), finding.get("severity")
    named = isinstance(check, str) and REVIEW_CHECK.fullmatch(check) is not None
    return named and severity in SEVERITIES and bool(model_text(finding.get("detail")))


def normal_id(value):
    """An id as the model may write it: "[L1]" -> "L1", "L1, L2" -> "L1". None stays None;
    anything that isn't text stays as it is (and so matches nothing)."""
    if not isinstance(value, str):
        return value
    return value.strip().strip("[]").split(",")[0].strip().strip("[]").strip()


NOT_A_RULE = {"ref": None, "opinion": None, "reason": None, "expected": None, "found": None}


def _review_row(finding):
    kept = {"line_id": normal_id(finding.get("line_id")), "check": defused(finding["check"])}
    texts = {key: model_text(finding.get(key)) for key in ("detail", "evidence")}
    origin = {"severity": finding["severity"], "source": "review", "confidence": "certain"}
    return {**kept, **origin, **texts, **NOT_A_RULE}


def _bound_review(saved, facts):
    """The parsed review, only if it names this locale and echoes its checksum."""
    review = parse_review(saved_data(saved).get("review"))
    named = review is not None and review.get("locale") == facts["locale"]
    return review if named and review.get("checksum") == facts["checksum"] else None


def saved_data(saved):
    """A run-folder read's data when it is a verified object, else {}."""
    data = saved["data"] if saved["status"] == "ok" else None
    return data if isinstance(data, dict) else {}


def counted_review(saved, facts):
    """The review if it counts (bound, and every finding well-formed), else None."""
    review = _bound_review(saved, facts)
    findings = review.get("findings") if review else None
    usable = isinstance(findings, list) and all(_finding_ok(each) for each in findings)
    return review if usable else None


def _rows(review, facts):
    rows = [_review_row(each) for each in review["findings"]] if review else []
    line_ids = [None, *(line["id"] for line in facts["lines"])]
    return [row for row in rows if row["line_id"] in line_ids], len(rows)


def review_rows(review, facts):
    """(rows matched to a line or the whole language, the number that matched nothing)."""
    matched, total = _rows(review, facts)
    return matched, total - len(matched)


def _opinion(entry, refs):
    """(ref, opinion) for an entry naming one of refs ("[R1]" and "r1" count as "R1")."""
    ref = normal_id(entry.get("finding_id")) if isinstance(entry, dict) else None
    ref = ref.upper() if isinstance(ref, str) else None
    if not (ref in refs and entry.get("opinion") in OPINIONS):
        return None
    return ref, {"opinion": entry["opinion"], "reason": model_text(entry.get("reason"))}


def _given_opinions(review, refs):
    entries = review.get("rule_checks") if review else None
    found = (_opinion(each, refs) for each in entries) if isinstance(entries, list) else ()
    return dict(each for each in found if each)


def rule_opinions(review, facts):
    """ref -> {opinion, reason} for every rule finding with a ref; cannot_tell by default."""
    refs = [finding["ref"] for finding in facts["rule_findings"] if finding["ref"]]
    given = _given_opinions(review, refs)
    return {ref: given.get(ref, {"opinion": "cannot_tell", "reason": ""}) for ref in refs}
