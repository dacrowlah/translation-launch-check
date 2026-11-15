"""The lines Translation Fix Suggestions is asked to fix, and its input text. A line goes to
the fixer when it has a blocker or warning on that line, except:
- an unsure finding counts only when the reviewer called it a real problem, so the fixer
  never "fixes" a notation difference;
- a line whose only such findings are market spelling gets the code-made spelling fix
  instead (a line with spelling and more starts from that fix).
Nothing here raises."""

from _checksum import json_size
from _loop_items import length_text, values_text
from _verdict import FAILING

SPELLING = "locale_spelling"
MAX_FIX_INPUT_BYTES = 50_000  # the fixer's input; lines past it get no suggestion


def fixable(finding):
    if finding["severity"] not in FAILING:
        return False
    return finding["confidence"] != "unsure" or finding["opinion"] == "real_problem"


def _brief(finding):
    return {key: finding[key] for key in ("check", "severity", "detail", "expected", "found")}


def _entry(scored, line, found):
    copied = {key: line[key] for key in ("channel", "field", "master", "text", "length")}
    start = line["spelling_fix"] or line["text"]
    head = {"locale": scored["locale"], "line_id": line["id"], **copied, "start_text": start}
    return {**head, "findings": [_brief(finding) for finding in found]}


def _to_fix(scored, line):
    found = [f for f in scored["findings"] if f["line_id"] == line["id"] and fixable(f)]
    return None if all(f["check"] == SPELLING for f in found) else _entry(scored, line, found)


def lines_to_fix(scored_locales):
    found = (_to_fix(scored, line) for scored in scored_locales for line in scored["lines"])
    return [entry for entry in found if entry]


def _problem_line(finding):
    return (
        f"\n- {finding['check']} ({finding['severity']}): {finding['detail']}{values_text(finding)}"
    )


def _entry_text(entry):
    head = f"[{entry['locale']} {entry['line_id']}] {entry['channel']}/{entry['field']}"
    texts = f"\nMaster: {entry['master']}\nTranslation: {entry['text']}"
    start = f"\nStart from: {entry['start_text']}" if entry["start_text"] != entry["text"] else ""
    problems = "".join(_problem_line(finding) for finding in entry["findings"])
    return head + texts + start + length_text(entry["length"]) + "\nProblems:" + problems


def within_cap(entries):
    """The leading entries whose texts fit MAX_FIX_INPUT_BYTES together."""
    total, kept = 0, []
    for entry in entries:
        total += json_size(_entry_text(entry))
        kept += [entry] if total <= MAX_FIX_INPUT_BYTES else []
    return kept


def fix_input(entries):
    return "\n\n".join(_entry_text(entry) for entry in entries)
