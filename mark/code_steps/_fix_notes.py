"""Suggested fixes the re-check would pass but that must never be applied as copy.

A fix that reads as a note, not copy ("TrailPro, not Trail Pro"): the re-check can't see one
when the term or wording it looks for is there. Two shapes, measured on the tool's real
findings:
- an untranslated line whose fix still quotes the old wording (the finding's `found`);
- a line whose only problems are do-not-translate terms, whose fix grew by more than the
  terms it restores, one separator each ("TrailPro (statt Trail-Pro-Jacke)").
Only fixable findings count (an info finding never changes the shape).

A fix that would start a spreadsheet formula (= + - @, tab or carriage return first) in the
corrected file, where the cell it replaces doesn't start with the same character: German copy
may start with "-30 %", a model-written "=HYPERLINK(...)" must not. The first character is
compared as written and after leading whitespace and invisible (Cc, Cf) characters, so
" =1+1" and a zero-width space before "=" are caught. Nothing here raises."""

from _fixable import fixable, fixable_at
from _report_view import line_of
from _routes import without_controls

DNT = "glossary_dnt"
UNTRANSLATED = "untranslated"
NO_LANGUAGE = {"lines": [], "findings": []}
FORMULA_STARTS = frozenset("=+-@\t\r")


def _quotes_old(text, findings):
    old = [f["found"] for f in findings if f["check"] == UNTRANSLATED and f["found"]]
    return any(wording in text for wording in old)


def _outgrows_terms(text, old, findings):
    """Each term may add its own length plus one separator (a missing name inserted with a
    space); more than that is wording the line didn't need."""
    terms = [f["expected"] or "" for f in findings if f["check"] == DNT]
    only_terms = bool(terms) and len(terms) == len(findings)
    return only_terms and len(text) - len(old) > sum(len(term) + 1 for term in terms)


def reads_as_a_note(text, old, findings):
    """Whether a fix `text` for a line now reading `old`, with these findings, is a note."""
    asked = [finding for finding in findings if fixable(finding)]
    return _quotes_old(text, asked) or _outgrows_terms(text, old, asked)


def _old_and_findings(scores, fix):
    scored = next((s for s in scores["locales"] if s["locale"] == fix["locale"]), NO_LANGUAGE)
    line = line_of(scored, fix["line_id"]) or {"text": ""}
    return line["text"], fixable_at(scored, fix["line_id"])


def fix_reads_as_a_note(scores, fix):
    """reads_as_a_note for a suggested fix, with its line's text and findings from scores."""
    return reads_as_a_note(fix["text"], *_old_and_findings(scores, fix))


def _firsts(text):
    """The first character as written, and the first after invisible (Cc, Cf) characters and
    whitespace. The raw one is still needed: the second drops a leading tab or carriage
    return."""
    return text[:1], without_controls(text).lstrip()[:1]


def starts_a_formula(text, old):
    """Whether a fix `text` for a line now reading `old` would start a formula it didn't: in
    either reading (_firsts), a formula character where `old` has another."""
    pairs = zip(_firsts(text), _firsts(old), strict=True)
    return any(first in FORMULA_STARTS and first != was for first, was in pairs)


def fix_starts_a_formula(scores, fix):
    """starts_a_formula for a suggested fix, with its line's text from scores."""
    return starts_a_formula(fix["text"], _old_and_findings(scores, fix)[0])
