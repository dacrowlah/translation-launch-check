"""How a line's length and a finding's values read in the agents' inputs and the canvas:
"28 of 30 ads_chars", " Expected: 30%. Found: 20 %.". Shared by the review input, the fix
input and the canvas, and kept apart so the report step doesn't carry the loop-item code.
Nothing here raises."""


def length_value(length):
    """ "28 of 30 ads_chars", "12 chars", or "" when the tool gave no length."""
    if not isinstance(length, dict):
        return ""
    limit = length.get("limit")
    return f"{length.get('value')}{'' if limit is None else f' of {limit}'} {length.get('unit')}"


def length_text(length):
    value = length_value(length)
    return f"\nLength: {value}" if value else ""


def values_text(finding):
    expected, found = finding["expected"], finding["found"]
    parts = ([f"Expected: {expected}."] if expected else []) + (
        [f"Found: {found}."] if found else []
    )
    return "".join(" " + part for part in parts)
