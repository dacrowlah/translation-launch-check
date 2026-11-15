"""Templates for step "Ask for a corrected file": the problem list and the template link.
Kept apart from _text_report so neither step inlines the other's text. Pure string
formatting; values from the file are only ever format arguments."""

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
