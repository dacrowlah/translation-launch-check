"""The corrected file: the checked file with every fix that passed the re-check applied, as a
CSV the user downloads and re-uploads as is. Same columns and rows, comma-delimited, UTF-8
with a BOM (Excel), CRLF line ends. A fix to a line with a price or currency finding is never
applied: prices come from the customer's price list. Neither is a fix that reads like a
correction note ("X, not Y"): it passes a presence-only re-check but is not copy. Nothing
here raises."""

import csv
import io
import re

from _campaign import clean_campaign
from _config import RULES
from _fixable import FOR_A_PERSON
from _platform import BOM, write_file
from _text_report import REPORT
from _verdict import FAILING

COLUMNS = ("id", "channel", "field")  # the CSV's fixed columns (_csv_package.FIXED_COLUMNS)


def _price_lines(scores):
    found = ((s["locale"], f) for s in scores["locales"] for f in s["findings"])
    return {(locale, f["line_id"]) for locale, f in found if f["check"] in FOR_A_PERSON}


def _noted(text, finding, master):
    """The problem's found value still in the text (as a whole token), or its expected value
    more often than the master has it (at least once): the shape of "X instead of Y"."""
    found, expected = finding.get("found"), finding.get("expected")
    if found and re.search(rf"(?<!\w){re.escape(found)}(?!\w)", text):
        return True
    return bool(expected) and text.count(expected) > max(1, master.count(expected))


def _findings_at(scored, line_id):
    return [finding for finding in scored["findings"] if finding["line_id"] == line_id]


def _line_facts(scores):
    """{(locale, line_id): (master, that line's findings)}."""
    lines = ((s, line) for s in scores["locales"] for line in s["lines"])
    return {(s["locale"], ln["id"]): (ln["master"], _findings_at(s, ln["id"])) for s, ln in lines}


def _reads_as_a_note(fix, facts):
    master, found = facts.get((fix["locale"], fix["line_id"]), ("", []))
    return any(_noted(fix["text"], finding, master) for finding in found)


def applied_fixes(scores, fixes):
    """{(locale, line_id): text} for every fix that passed the re-check, prices and fixes
    that read as a correction note excepted."""
    facts = _line_facts(scores)
    kept = [fix for fix in fixes if fix["status"] == "passes" and not _reads_as_a_note(fix, facts)]
    keys = {(fix["locale"], fix["line_id"]): fix["text"] for fix in reversed(kept)}
    return {key: text for key, text in keys.items() if key not in _price_lines(scores)}


def _corrected_row(index, scores, applied):
    line = scores["locales"][0]["lines"][index]
    texts = [
        applied.get((s["locale"], line["id"]), s["lines"][index]["text"]) for s in scores["locales"]
    ]
    return [*(line[key] for key in COLUMNS), line["master"], *texts]


def _table(scores, applied):
    """The header, then every line in order with the applied fixes."""
    header = [*COLUMNS, RULES["master_locale"], *(s["locale"] for s in scores["locales"])]
    count = len(scores["locales"][0]["lines"])
    return [header, *(_corrected_row(index, scores, applied) for index in range(count))]


def corrected_csv(scores, applied):
    """The file's text: comma-delimited, csv-module quoting, CRLF, after a UTF-8 BOM."""
    out = io.StringIO()
    csv.writer(out, lineterminator="\r\n").writerows(_table(scores, applied))
    return BOM + out.getvalue()


def open_lines(scores, applied):
    """How many lines with a blocker or warning got no applied fix: a person decides them."""
    found = ((s["locale"], f) for s in scores["locales"] for f in s["findings"])
    flagged = {
        (locale, f["line_id"]) for locale, f in found if f["line_id"] and f["severity"] in FAILING
    }
    return len(flagged - set(applied))


def _file_name(scores, run_key):
    return REPORT["corrected_name"].format(
        campaign=clean_campaign(scores["campaign"]), key=run_key[:6]
    )


def _written(scores, applied, run_key):
    """The download link, or None: the export never fails the report."""
    try:
        return write_file(_file_name(scores, run_key), corrected_csv(scores, applied))
    except Exception:  # a bug here must not cost the user the report
        return None


def corrected_file(scores, fixes, run_key):
    """None when no fix passed; else {"url" (None if the write failed), "applied", "open"}."""
    applied = applied_fixes(scores, fixes)
    if not applied:
        return None
    url = _written(scores, applied, run_key)
    return {"url": url, "applied": len(applied), "open": open_lines(scores, applied)}
