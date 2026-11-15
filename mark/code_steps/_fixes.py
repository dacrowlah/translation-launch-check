"""Suggested fixes: the fixer agent's drafts (only for lines it was sent) and the code-made
spelling fixes, re-checked together with ONE localization_check call. A fix passes when its
line has no blocker or warning and it doesn't read as a note; if the tool fails, every fix is
"not re-checked". Fixes never change verdicts: the verdict describes the file as submitted.
Nothing here raises."""

from _agent_output import agent_answer
from _config import RULES
from _fix_notes import fix_reads_as_a_note
from _fixable import SPELLING, fixable_at
from _model_output import model_text
from _shared import call_tool
from _tool_report import usable_report
from _verdict import FAILING


def _fix(key, text, kind, note=""):
    return {"locale": key[0], "line_id": key[1], "text": text, "kind": kind, "note": note}


def _key(item):
    return (item.get("locale"), item.get("line_id"))


def _sent(scores):
    return [(entry["locale"], entry["line_id"]) for entry in scores["lines_to_fix"]]


def _usable_text(text):
    short = isinstance(text, str) and len(text) <= RULES["limits"]["max_cell_chars"]
    return short and bool(text.strip())


def _agent_fix(fix):
    """A usable draft, or None. Only drafts for lines that were sent are kept (_agent_fixes)."""
    usable = isinstance(fix, dict) and _usable_text(fix.get("suggested_text"))
    return (
        _fix(_key(fix), fix["suggested_text"], "agent", model_text(fix.get("note")))
        if usable
        else None
    )


def _agent_fixes(scores, raw):
    sent, given = _sent(scores), (agent_answer(raw) or {}).get("fixes")
    found = [_agent_fix(each) for each in given] if isinstance(given, list) else []
    first = {_key(fix): fix for fix in reversed(found) if fix}
    return [first[key] for key in sent if key in first]


def _spelled(scored, line):
    return any(finding["check"] == SPELLING for finding in fixable_at(scored, line["id"]))


def _spelling_fix(scored, line, sent):
    key = (scored["locale"], line["id"])
    wanted = _spelled(scored, line) and line["spelling_fix"] and key not in sent
    return _fix(key, line["spelling_fix"], "spelling") if wanted else None


def suggested_fixes(scores, raw):
    """The agent's fixes (the first per line, in the order lines were sent), then the
    spelling fixes for lines the agent wasn't asked about."""
    sent = _sent(scores)
    spelled = [_spelling_fix(s, line, sent) for s in scores["locales"] for line in s["lines"]]
    return _agent_fixes(scores, raw) + [fix for fix in spelled if fix]


def _fixed_text(fixes, locale, line):
    found = [fix["text"] for fix in fixes if _key(fix) == (locale, line["id"])]
    return found[0] if found else line["text"]


def _recheck_line(index, fixed, fixes):
    first = fixed[0]["lines"][index]
    texts = {s["locale"]: _fixed_text(fixes, s["locale"], s["lines"][index]) for s in fixed}
    names = {key: first[key] for key in ("id", "channel", "field")}
    return {**names, "texts": {RULES["master_locale"]: first["master"], **texts}}


def _fixed_rows(lines, fixes):
    ids = {fix["line_id"] for fix in fixes}
    return [index for index, line in enumerate(lines) if line["id"] in ids]


def recheck_package(scores, fixes):
    """The lines that have a fix, in every locale that has one; a fixed line's text replaces
    the translation, the other cells keep theirs."""
    fixed = [s for s in scores["locales"] if any(fix["locale"] == s["locale"] for fix in fixes)]
    lines = [_recheck_line(index, fixed, fixes) for index in _fixed_rows(fixed[0]["lines"], fixes)]
    head = {"campaign": scores["campaign"], "master_locale": RULES["master_locale"]}
    return {**head, "locales": [s["locale"] for s in fixed], "lines": lines}


def _rechecked_line(body, fix):
    report = next((r for r in body["locales"] if r["locale"] == fix["locale"]), {"lines": []})
    return next((line for line in report["lines"] if line["id"] == fix["line_id"]), None)


def fix_status(body, fix):
    """{"status": "passes" | "still_has" | "not_rechecked", "checks": [...]}."""
    line = _rechecked_line(body, fix) if body else None
    if line is None:
        return {"status": "not_rechecked", "checks": []}
    checks = sorted({str(f.get("check")) for f in line["findings"] if f.get("severity") in FAILING})
    return {"status": "still_has" if checks else "passes", "checks": checks}


def _recheck_body(scores, fixes):
    pkg = recheck_package(scores, fixes)
    result = call_tool("localization_check", **pkg)
    return result["body"] if usable_report(result["body"], pkg["locales"]) else None


def _fix_status_or_note(scores, body, fix):
    """The re-check status, unless the fix reads as a note: then it never passes."""
    status = fix_status(body, fix)
    noted = status["status"] != "still_has" and fix_reads_as_a_note(scores, fix)
    return {"status": "reads_as_a_note", "checks": []} if noted else status


def rechecked(scores, fixes):
    """Each fix with its status: the re-check's, from one call for all of them, or "reads as
    a note" (_fix_notes)."""
    body = _recheck_body(scores, fixes) if fixes else None
    return [{**fix, **_fix_status_or_note(scores, body, fix)} for fix in fixes]
