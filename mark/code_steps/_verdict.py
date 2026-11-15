"""Verdicts, computed in code only: blocker over incomplete over warning, and nothing
unverified is ever ready. An unsure finding stays open whatever the reviewer's opinion, so it
caps its language at ready_with_warnings. A severity the workflow doesn't know makes the
language incomplete, never ready. Nothing here raises."""

from _config import RULES

VERDICTS = ("fix_first", "check_incomplete", "ready_with_warnings", "ready")  # precedence
CHECK_IDS = tuple(RULES["severities"])  # the tool's check ids: the severities' keys
CHECK_STATUSES = ("verified", "not_applicable")
SEVERITIES = ("blocker", "warning", "info")
FAILING = ("blocker", "warning")  # a line with one of these needs a fix


def _all_checks_ran(checks):
    statuses = checks if isinstance(checks, dict) else {}
    return all(statuses.get(check) in CHECK_STATUSES for check in CHECK_IDS)


def _open(findings):
    """A warning, or an unsure finding of any severity."""
    return any(f["severity"] == "warning" or f["confidence"] == "unsure" for f in findings)


def _incomplete(findings, not_checked, checks):
    unknown = any(finding["severity"] not in SEVERITIES for finding in findings)
    return not_checked or unknown or not _all_checks_ran(checks)


def verdict_for(findings, not_checked, checks):
    if any(finding["severity"] == "blocker" for finding in findings):
        return "fix_first"
    if _incomplete(findings, not_checked, checks):
        return "check_incomplete"
    return "ready_with_warnings" if _open(findings) else "ready"


def overall(verdicts):
    """The most severe verdict; check_incomplete when there is none."""
    ranks = [VERDICTS.index(verdict) for verdict in verdicts if verdict in VERDICTS]
    return VERDICTS[min(ranks)] if ranks and len(ranks) == len(verdicts) else "check_incomplete"
