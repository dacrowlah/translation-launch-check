"""Which findings a suggested fix should address, shared by the fixer's input (Score) and
the code-made spelling fixes (the report). Nothing here raises."""

from _verdict import FAILING

SPELLING = "locale_spelling"
FOR_A_PERSON = ("currency_code", "currency_amount")  # prices: never changed by the fixer


def fixable(finding):
    """A blocker or warning; an unsure one only when the reviewer called it a real problem,
    so the fixer never "fixes" a notation difference."""
    if finding["severity"] not in FAILING:
        return False
    return finding["confidence"] != "unsure" or finding["opinion"] == "real_problem"
