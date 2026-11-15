"""User-facing templates shared by the steps. Problem templates: _text_problems. Report
templates: _text_report."""

TEXT = {
    "internal_error": "Something went wrong on our side. Please re-run the check.",
    "internal_error_summary": "internal error",
    "summary_needs_info": "The file needs changes; problems found: {count}.",
    "summary_checked": "Languages checked: {count}.",
    "summary_not_run": "The checks couldn't run.",
    "summary_saved": "Review saved.",
    "summary_not_saved": "Review not saved.",
    "summary_scored": "Scored: {outcome}.",
}
