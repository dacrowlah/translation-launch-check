"""One language's score: its rule findings (each with the reviewer's second opinion where
one was asked for), the review's findings, its verdict, and its lines and back-translation
as the report shows them. Nothing here raises."""

from _review import counted_review, review_rows, rule_opinions, saved_data
from _verdict import verdict_for

NO_OPINION = {"opinion": None, "reason": None}
MAX_FOUND = 300  # the run log's findings list; the total says how many there were
COLUMN = "column"
# A reviewer finding that restates a code finding on the same line is dropped; the code's
# stays: {review check: the code checks it restates}.
SAME_PROBLEM = {"tone": {"formality"}}
# A reviewer note that says it is not a problem ("... a natural paraphrase. No finding.") is
# dropped: matched case-insensitively in its detail.
NOT_A_PROBLEM = ("no finding", "nothing needs to change", "no change needed")


def _rule_rows(facts, review):
    opinions = rule_opinions(review, facts)
    rows = facts["rule_findings"]
    return [
        {**f, "source": "rules", "evidence": "", **opinions.get(f["ref"], NO_OPINION)} for f in rows
    ]


def _back_translation(saved):
    text = saved_data(saved).get("back_translation")
    return text if isinstance(text, str) and text.strip() else None


def _report_line(master, line):
    names = {key: master[key] for key in ("id", "channel", "field")}
    found = {key: line[key] for key in ("text", "length", "spelling_fix")}
    return {**names, "master": master["text"], **found}


def _restates(row, rule_rows):
    same = SAME_PROBLEM.get(row["check"], set())
    return any(rule["line_id"] == row["line_id"] and rule["check"] in same for rule in rule_rows)


def _cancels_itself(row):
    return any(phrase in row["detail"].lower() for phrase in NOT_A_PROBLEM)


def _dropped(row, rule_rows):
    return _restates(row, rule_rows) or _cancels_itself(row)


def _merged(rule_rows, review_rows_):
    """The rule rows, then the review rows that neither restate one nor cancel themselves."""
    return rule_rows + [row for row in review_rows_ if not _dropped(row, rule_rows)]


def _judged(facts, saved):
    """A language is not checked without a counted review and a back-translation, or when
    the tool didn't check it (unsupported_locale). Review notes whose line id matches no
    line are dropped and counted; one restating a code finding on its line is dropped."""
    review, back = counted_review(saved, facts), _back_translation(saved)
    not_checked = review is None or back is None or facts["status"] != "checked"
    rows, unmatched = review_rows(review, facts)
    findings = _merged(_rule_rows(facts, review), rows)
    return {"findings": findings, "not_checked": not_checked, "unmatched_notes": unmatched}


def score_locale(facts, master_lines, saved):
    judged = _judged(facts, saved)
    verdict = verdict_for(judged["findings"], judged["not_checked"], facts["checks"])
    lines = [_report_line(m, line) for m, line in zip(master_lines, facts["lines"], strict=True)]
    head = {"locale": facts["locale"], "verdict": verdict, **judged}
    return dict(head, lines=lines, back_translation=_back_translation(saved))


def _found_key(scored, finding):
    return " ".join([scored["locale"], finding["line_id"] or COLUMN, finding["check"]])


def found_list(scored_locales):
    """Every finding that counts, rule or review, as "<locale> <line_id> <check>" ("column"
    for a whole-column finding): sorted, once each, at most MAX_FOUND, with the total. The
    seeded catch-rate script reads it from the run log (scores.json never leaves Mark)."""
    keys = sorted({_found_key(s, f) for s in scored_locales for f in s["findings"]})
    return {"found": keys[:MAX_FOUND], "found_total": len(keys)}
