import pytest

from _config import RULES
from _webhook_package import from_webhook
from step_builders import a_line, a_package, a_payload, problems_of

# The sender fixture from the mark-code-step-patterns skill: a conforming sender reproduces it.
FIXTURE = {
    "campaign": "Example",
    "master_locale": "en-US",
    "locales": ["de-DE"],
    "lines": [
        {
            "id": "L1",
            "channel": "email",
            "field": "body",
            "texts": {
                "en-US": "Save 20% <b>now</b> & more\nDetails",
                "de-DE": "Jetzt 20 % sparen <b>jetzt</b> & mehr\u2028Gr\u00fc\u00dfe",
            },
        }
    ],
    "package_sha256": "0e294581c65d6bfe06b3f223cfe5555f3d48335660934173779c10a804cb6f75",
}
IN_TRANSIT = "The package changed in transit."
BAD_SHAPE = "The package doesn't have the expected fields."


def test_the_skills_sender_fixture_is_accepted():
    pkg, problems = from_webhook(FIXTURE, RULES)
    assert problems == [] and pkg["lines"][0]["texts"]["de-DE"].endswith("Gr\u00fc\u00dfe")
    assert "package_sha256" not in pkg


def test_a_changed_value_fails_the_checksum():
    changed = {**FIXTURE, "campaign": "Example 2"}
    assert problems_of(from_webhook(changed, RULES)) == [IN_TRANSIT]


@pytest.mark.parametrize("checksum", [None, "", FIXTURE["package_sha256"][:16], 7])
def test_a_missing_or_short_checksum_fails(checksum):
    payload = {**FIXTURE, "package_sha256": checksum}
    assert problems_of(from_webhook(payload, RULES)) == [IN_TRANSIT]


@pytest.mark.parametrize(
    "change",
    [
        {"extra": 1},
        {"locales": "de-DE"},
        {"locales": ["de-DE", 5]},
        {"campaign": 5},
        {"lines": [a_line(**{"en-US": "Hi", "de-DE": "Hallo", "fr-FR": "Salut"})]},
        {"lines": [{**a_line(**{"en-US": "Hi", "de-DE": "Hallo"}), "note": "x"}]},
        {"lines": [a_line(**{"en-US": "Hi", "de-DE": 5})]},
        {"lines": ["L1"]},
    ],
)
def test_unknown_keys_and_wrong_types_are_rejected(change):
    payload = a_payload({**a_package(), **change})
    assert problems_of(from_webhook(payload, RULES)) == [BAD_SHAPE]


def test_the_package_rules_apply_to_webhooks_too():
    lines = [a_line(**{"en-US": "Hi", "de-DE": ""}), a_line(**{"en-US": "Yo", "de-DE": "x\x00"})]
    payload = a_payload(a_package(lines=lines))
    assert problems_of(from_webhook(payload, RULES)) == [
        "L1 has no de-DE text.",
        "The id L1 is used more than once.",
        "L1's de-DE text contains a NUL character.",
    ]


def test_the_campaign_is_cleaned_and_checked_for_the_reserved_word():
    pkg, _ = from_webhook(a_payload(a_package(campaign="Sale\u202e 2026!")), RULES)
    assert pkg["campaign"] == "Sale 2026"
    reserved = a_payload(a_package(campaign="tlc_route_fix"))
    assert problems_of(from_webhook(reserved, RULES)) == [
        'The campaign name contains the reserved word "tlc_route".'
    ]


def test_padded_locale_codes_are_trimmed_before_the_rules():
    line = a_line(**{" en-US": "Hi", "de-DE ": "Hallo"})
    padded = {**a_package(lines=[line]), "master_locale": " en-US", "locales": ["de-DE "]}
    pkg, problems = from_webhook(a_payload(padded), RULES)
    assert problems == [] and (pkg["master_locale"], pkg["locales"]) == ("en-US", ["de-DE"])
    assert pkg["lines"][0]["texts"] == {"en-US": "Hi", "de-DE": "Hallo"}
