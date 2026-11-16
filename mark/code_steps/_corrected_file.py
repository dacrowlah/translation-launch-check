"""The corrected file: the checked file with every fix that passed the re-check applied, as a
CSV the user downloads and re-uploads as is. Same columns and rows, comma-delimited, UTF-8
with a BOM (Excel), CRLF line ends. A fix to a line with a price or currency finding is never
applied: prices come from the customer's price list. A fix unfit as copy (it reads as a note,
or would start a spreadsheet formula) never passes (_fix_notes), so it isn't applied either.
Nothing here raises."""

import csv
import io

from _campaign import clean_campaign
from _config import RULES
from _csv_format import BOM, FIXED_COLUMNS
from _fixable import FOR_A_PERSON
from _platform import write_file
from _text_report import REPORT
from _verdict import FAILING


def _price_lines(scores):
    findings = ((s["locale"], f) for s in scores["locales"] for f in s["findings"])
    return {(locale, f["line_id"]) for locale, f in findings if f["check"] in FOR_A_PERSON}


def applied_fixes(scores, fixes):
    """{(locale, line_id): text} for every fix that passed the re-check, prices excepted."""
    kept = [fix for fix in fixes if fix["status"] == "passes"]
    keys = {(fix["locale"], fix["line_id"]): fix["text"] for fix in reversed(kept)}
    return {key: text for key, text in keys.items() if key not in _price_lines(scores)}


def _corrected_row(index, scores, applied):
    line = scores["locales"][0]["lines"][index]
    texts = [
        applied.get((s["locale"], line["id"]), s["lines"][index]["text"]) for s in scores["locales"]
    ]
    return [*(line[key] for key in FIXED_COLUMNS), line["master"], *texts]


def _table(scores, applied):
    """The header, then every line in order with the applied fixes."""
    header = [*FIXED_COLUMNS, RULES["master_locale"], *(s["locale"] for s in scores["locales"])]
    count = len(scores["locales"][0]["lines"])
    return [header, *(_corrected_row(index, scores, applied) for index in range(count))]


def corrected_csv(scores, applied):
    """The file's text: comma-delimited, csv-module quoting, CRLF, after a UTF-8 BOM."""
    out = io.StringIO()
    csv.writer(out, lineterminator="\r\n").writerows(_table(scores, applied))
    return BOM + out.getvalue()


def open_lines(scores, applied):
    """How many lines with a blocker or warning got no applied fix: a person decides them."""
    findings = ((s["locale"], f) for s in scores["locales"] for f in s["findings"])
    failing = ((locale, f) for locale, f in findings if f["severity"] in FAILING)
    flagged = {(locale, f["line_id"]) for locale, f in failing if f["line_id"]}
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
