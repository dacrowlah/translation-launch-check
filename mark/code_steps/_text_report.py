"""Templates for the report: the chat reply (also the QA-inbox email), the canvas, and the
corrected-file request. Pure string formatting; values from the file are only ever
format arguments. A pass is never called "approved" or "ready to launch"."""

LABELS = {
    "fix_first": "Fix first",
    "check_incomplete": "Check incomplete - re-run",
    "ready_with_warnings": "No blocking issues found by automated checks",
    "ready": "No issues found by automated checks",
}
OPINION_LABELS = {
    "real_problem": "likely a real problem",
    "same_meaning": "likely the same meaning, written differently",
    "cannot_tell": "can't tell",
}
FIX_STATUS = {
    "passes": "passes the rule checks",
    "still_has": "still has: {checks}",
    "not_rechecked": "couldn't be re-checked",
}
NOUNS = {"blocker": ("blocker", "blockers"), "warning": ("warning", "warnings")}

REPORT = {
    "overall_fix_first": (
        "Overall: Fix first. {count} of {total} languages need fixes before launch."
    ),
    "overall_check_incomplete": (
        "Overall: Check incomplete - re-run. {count} of {total} languages couldn't be fully "
        "checked."
    ),
    "overall_ready_with_warnings": (
        "Overall: No blocking issues found by automated checks. Review the warnings below."
    ),
    "overall_ready": "Overall: No issues found by automated checks.",
    "overall_unreadable": "Overall: Check incomplete - re-run. The results couldn't be read back.",
    "locale": "- {locale}: {label}",
    "counts": " ({counts})",
    "count": "{count} {noun}",
    "human_count_one": ", 1 item needs a human look",
    "human_count": ", {count} items need a human look",
    "unmatched_one": ", 1 reviewer note couldn't be matched to a line",
    "unmatched": ", {count} reviewer notes couldn't be matched to a line",
    "unfixed": "{count} more lines need a fix but got no suggestion (too many for one run).",
    "human_more": "- ...and {count} more in the detailed report.",
    "top_fixes": "Top fixes:",
    "fix": "- {locale} {line}: {text} ({status})",
    "spelling_fix": "- {locale} {line}: {text} (spelling fix, {status})",
    "canvas_link": "Detailed report: [{name}]({url})",
    "canvas_failed": "The detailed report couldn't be saved; re-run the check to get it.",
    "human_heading": "{locale} - needs a human look:",
    "human_item": "- {line} ({check}): {question}",
    "human_master": "  - Master: {text}",
    "human_translation": "  - Translation: {text}",
    "human_opinion": "  - Reviewer: {opinion}",
    "reason": " - {reason}",
    "whole_column": "whole column",
    "rule": "A language passes only when every check ran and nothing blocks it.",
    "rules_version": "Checked against market rules v{version} (effective {date}).",
    "footer": "Screening aid, not linguistic or legal sign-off.",
    "email_failed": "The report email to the QA inbox couldn't be sent.",
    "subject": "Translation Launch Check - {campaign}: {label}",
    "canvas_name": "Translation Launch Check - {campaign} - {run_time} - {key}",
    "summary": "Report written: {outcome}.",
    "failed": "Something went wrong writing the report. Please re-run the check.",
    "failed_summary": "report failed",
}

CANVAS = {
    "title": "# Translation Launch Check - {campaign}",
    "run": "Run: {run_time}",
    "locale": "## {locale}: {label}",
    "not_checked": "This language couldn't be fully checked. Re-run the check.",
    "human": "### Needs a human look",
    "human_item": "- **{line}** ({check}): {question}",
    "human_detail": "  - {name}: {text}",
    "human_names": ("Master", "Translation", "Back-translation", "Reviewer's opinion"),
    "spelling_kind": " (spelling fix)",
    "unmatched": "Reviewer notes that couldn't be matched to a line: {count}.",
    "findings": "### Findings",
    "findings_head": "| Line | Source | Check | Severity | Detail | Expected | Found | Reviewer |",
    "findings_rule": "|---|---|---|---|---|---|---|---|",
    "no_findings": "No findings.",
    "lines": "### Lines",
    "lines_head": "| Line | Channel | Master | Translation | Length | Suggested fix | Re-check |",
    "lines_rule": "|---|---|---|---|---|---|---|",
    "back_translation": "### Back-translation",
    "no_back_translation": "No back-translation.",
}

NEEDS_INFO = {
    "intro": "Your file needs a few changes before it can be checked:",
    "problem": "- {where}: {message} {suggestion}",
    "problem_nowhere": "- {message} {suggestion}",
    "none": "Your file couldn't be checked. Compare it with the template.",
    "template": "Template: [CSV template]({url})",
    "summary": "Asked for a corrected file; problems listed: {count}.",
    "not_run": "We couldn't check your file right now; please try again.",
    "not_run_summary": "The checks couldn't run.",
}
