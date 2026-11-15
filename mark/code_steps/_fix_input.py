"""The lines Translation Fix Suggestions is asked to fix, and its input text. A line goes to
the fixer when it has a blocker or warning on that line, except:
- an unsure finding counts only when the reviewer called it a real problem, so the fixer
  never "fixes" a notation difference;
- a line whose only such findings are market spelling gets the code-made spelling fix
  instead (a line with spelling and more starts from that fix);
- a price or currency finding is for a person, never the fixer: prices come from the
  customer's price list. It is shown in the line's block without values, and a line with
  nothing else to fix is not sent.
Nothing here raises."""

from _budgets import FIX_BOUNDS, fix_overhead, input_budget
from _checksum import json_size
from _finding_text import length_text, values_text
from _fixable import FOR_A_PERSON, SPELLING, fixable

PERSON_HEADING = "\nFor a person (keep prices and currencies as written):"
MAX_FIX_INPUT_BYTES = 50_000  # the fixer's input; lines past it get no suggestion
# The fixer's answer goes into "Write and send the report": the lines' fixes must fit that
# step's budget. The schema bounds each fix (FIX_BOUNDS); a draft is expected to run about a
# fifth longer than its start text, never past the schema's suggested_text bound.
FIXES_BUDGET = input_budget("report") - 200  # run_key, verdict_checksum and the keys
DRAFT_GROWTH = 1.2
LIMITS = (MAX_FIX_INPUT_BYTES, FIXES_BUDGET, FIX_BOUNDS["fixes"])  # bytes in, bytes out, fixes


def _brief(finding):
    return {key: finding[key] for key in ("check", "severity", "detail", "expected", "found")}


def _entry(scored, line, found):
    copied = {key: line[key] for key in ("channel", "field", "master", "text", "length")}
    start = line["spelling_fix"] or line["text"]
    head = {"locale": scored["locale"], "line_id": line["id"], **copied, "start_text": start}
    return {**head, "findings": [_brief(finding) for finding in found]}


def _for_the_fixer(finding):
    return finding["check"] not in (SPELLING, *FOR_A_PERSON)


def _to_fix(scored, line):
    found = [f for f in scored["findings"] if f["line_id"] == line["id"] and fixable(f)]
    return _entry(scored, line, found) if any(map(_for_the_fixer, found)) else None


def lines_to_fix(scored_locales):
    found = (_to_fix(scored, line) for scored in scored_locales for line in scored["lines"])
    return [entry for entry in found if entry]


def _finding_line(finding):
    return f"\n- {finding['check']} ({finding['severity']}): {finding['detail']}"


def _person_text(findings):
    """Price and currency problems, for a person: without values, so nothing invites a change."""
    person = [finding for finding in findings if finding["check"] in FOR_A_PERSON]
    return PERSON_HEADING + "".join(map(_finding_line, person)) if person else ""


def _problems_text(findings):
    fixes = [f for f in findings if f["check"] not in FOR_A_PERSON]
    lines = "".join(_finding_line(finding) + values_text(finding) for finding in fixes)
    return "\nProblems:" + lines + _person_text(findings)


def _entry_text(entry):
    head = f"[{entry['locale']} {entry['line_id']}] {entry['channel']}/{entry['field']}"
    texts = f"\nMaster: {entry['master']}\nTranslation: {entry['text']}"
    start = f"\nStart from: {entry['start_text']}" if entry["start_text"] != entry["text"] else ""
    return head + texts + start + length_text(entry["length"]) + _problems_text(entry["findings"])


def expected_fix_bytes(entry):
    """About how much escaped JSON the fixer's answer for this line takes: a draft of the
    start text's own character mix, and the note and keys at their bounds."""
    start = entry["start_text"]
    size = min(FIX_BOUNDS["suggested_text"], int(len(start) * DRAFT_GROWTH) + 1)
    return json_size((start * 2)[:size]) + fix_overhead()


def _costs(entry):
    return json_size(_entry_text(entry)), expected_fix_bytes(entry), 1


def _fits(used):
    return all(total <= limit for total, limit in zip(used, LIMITS, strict=True))


def within_cap(entries):
    """The leading entries whose texts fit the fixer's input, whose expected fixes fit the
    report step's input, and no more than the fixer's schema admits, together."""
    kept, used = [], (0, 0, 0)
    for entry in entries:
        used = tuple(total + cost for total, cost in zip(used, _costs(entry), strict=True))
        kept += [entry] if _fits(used) else []
    return kept


def fix_input(entries):
    return "\n\n".join(_entry_text(entry) for entry in entries)
