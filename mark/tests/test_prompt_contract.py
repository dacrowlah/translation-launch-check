"""The agents' prompts (Task 19, merged) show the exact text these steps send them. These
tests feed each prompt example's facts through the real builders and require the output to
appear in the prompt verbatim, so the code and the prompts can't drift apart. A change to
either goes through the controller, in both places together."""

from _fix_input import fix_input
from _loop_items import review_input
from builders import FIX_DIR, REVIEW_DIR

CHF = (
    "Couldn't find the master's price in this line. Is it written in a form the tool can't "
    "read (kanji numerals, a currency word), or is it missing?"
)


def prompt(agent_dir):
    return (agent_dir / "prompt.md").read_text(encoding="utf-8")


def a_rule_finding(ref, line_id, check, detail, *values):
    expected, found = (*values, None, None)[:2]
    return {
        "ref": ref,
        "line_id": line_id,
        "check": check,
        "detail": detail,
        "expected": expected,
        "found": found,
    }


EXAMPLE_FINDINGS = [
    a_rule_finding("R1", "L3", "currency_code", CHF, "CHF"),
    a_rule_finding("R2", "L5", "numbers", "A number differs from the master.", "00:00", "12:00"),
    a_rule_finding("R3", "L6", "dates", "A date or weekday differs from the master.", "Friday"),
    a_rule_finding(None, "L7", "formality", "Formal and informal address are mixed."),
    a_rule_finding(
        "R4",
        None,
        "language_column",
        "The de-CH column is short and reads as English. Is it German?",
    ),
]


def test_the_review_inputs_code_findings_match_the_merged_prompt():
    sections = review_input([], {"lines": [], "rule_findings": EXAMPLE_FINDINGS})
    assert sections.startswith("Already reported by code (never report these again, in any form):")
    assert "\n\nRule findings to double-check:\n[R1] L3 (currency_code): " in sections
    assert sections + "\n</lines>" in prompt(REVIEW_DIR)


def test_the_review_input_with_no_code_findings_matches_the_merged_prompt():
    sections = review_input([], {"lines": [], "rule_findings": []})
    assert sections + "\n</lines>" in prompt(REVIEW_DIR)
    assert sections.endswith(": none.\n\nRule findings to double-check: none.")


def an_entry(head, texts, length, findings):
    locale, line_id, channel, field = head
    master, text, start = texts
    names = {"locale": locale, "line_id": line_id, "channel": channel, "field": field}
    return {
        **names,
        "master": master,
        "text": text,
        "start_text": start,
        "length": length,
        "findings": findings,
    }


def a_problem(check, severity, detail, *values):
    expected, found = (*values, None, None)[:2]
    return {
        "check": check,
        "severity": severity,
        "detail": detail,
        "expected": expected,
        "found": found,
    }


CLAIM = "The offer was widened from members to all customers."
TOO_LONG = "The text is longer than the channel allows (characters; double-width ones count 2)."
FR = "-30 % sur tout pour tous les clients"
FAVORITE = "{{first_name}}, your favorite colors are "
SPELLING = "A word is not spelled the way this market spells it."
EXAMPLE_1 = an_entry(
    ("fr-FR", "L4", "google_ads", "headline"),
    ("Members: 30% off everything", FR, FR),
    {"value": 36, "limit": 30, "unit": "ads_chars"},
    [
        a_problem("claim", "blocker", CLAIM),
        a_problem("length_hard", "blocker", TOO_LONG, "30", "36"),
    ],
)
EXAMPLE_2 = an_entry(
    ("en-GB", "L2", "email", "preheader"),
    (
        FAVORITE + "30% off",
        FAVORITE + "20% off",
        "{{first_name}}, your favourite colours are 20% off",
    ),
    {"value": 48, "limit": 90, "unit": "chars"},
    [
        a_problem("numbers", "blocker", "A number differs from the master.", "30", "20"),
        a_problem("locale_spelling", "warning", SPELLING),
    ],
)


def test_the_fix_inputs_match_the_merged_prompts_examples():
    text = prompt(FIX_DIR)
    assert fix_input([EXAMPLE_1]) + "\n```" in text and fix_input([EXAMPLE_2]) + "\n```" in text
