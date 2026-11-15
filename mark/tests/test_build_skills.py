"""The two organization skills: Market Rules and Glossary, rendered from the tool's own
rules file (so the agents' rules and the code's checks cannot drift apart), and the Fix
Playbook, attached when the fixer calls copy_fit_check.

Some asserts quote today's rules.json data (the version, the forbidden lists). A rules edit
then fails a test on purpose: re-read the rendered skill before updating the literal."""

import copy
import json

import pytest

from _build.market_rules import CHECK_NAMES, MARKER, render_market_rules
from _build.skills import build_skills, skill_export
from builders import RULES_FILE, SKILLS_DIR

TEMPLATE_FILE = SKILLS_DIR / "market-rules-glossary.template.md"
PLAYBOOK_FILE = SKILLS_DIR / "translation-fix-playbook.md"
RULES_FULL = json.loads(RULES_FILE.read_text(encoding="utf-8"))


def _body(rules=RULES_FULL):
    """The Market Rules skill text, built from the real template and the given rules."""
    return build_skills(SKILLS_DIR, rules)["market-rules-glossary"]["skill"]


def test_market_rules_lists_every_dnt_term_and_formality():
    body = _body()
    dnt = "Keep these exactly as written: TrailPro Ultra, TrailPro, Black Friday, Cyber Monday."
    assert dnt in body
    for line in ("de-DE: formal (Sie)", "fr-FR: formal (vous)", "de-CH: formal (Sie)"):
        assert line in body
    assert "ja-JP: no formality rule; judge register as tone" in body


def test_market_rules_lists_market_spelling():
    body = _body()
    uk = "en-GB: colour, not color; centre, not center; favourite, not favorite; -ise, not -ize"
    assert uk in body
    assert "de-CH: ss, not \u00df" in body


def test_market_rules_lists_forbidden_terms_per_locale():
    body = _body()
    assert "Never use these. The exact form is the code's finding; other forms count too." in body
    assert "- de-DE: garantiert\n" in body
    assert "- fr-FR: garanti, garantie\n" in body
    assert "- ja-JP: \u6700\u5b89\u5024\u4fdd\u8a3c\n" in body


def test_market_rules_lists_approved_translations():
    expected = (
        "- ja-JP: Black Friday may be written "
        "\u30d6\u30e9\u30c3\u30af\u30d5\u30e9\u30a4\u30c7\u30fc; "
        "Cyber Monday may be written \u30b5\u30a4\u30d0\u30fc\u30de\u30f3\u30c7\u30fc\n"
    )
    assert expected in _body()


def test_market_rules_lists_accepted_loanwords_by_language():
    body = _body()
    assert (
        "Normal in the market's copy: these and similar loanwords are never untranslated." in body
    )
    assert "- de (de-DE, de-CH): sale, shop, online, newsletter, outlet, deals" in body
    assert "- fr (fr-FR): shopping, newsletter, outlet, black friday, cyber monday\n" in body
    assert "- ja (" not in body  # an empty list renders nothing


def test_market_rules_lists_typography():
    assert "- fr-FR: a space before ; : ! ? and spaces inside guillemets\n" in _body()


def test_market_rules_shows_the_rules_version():
    assert "## Market rules (v1.0, effective 2026-11-13)" in _body()


def test_market_rules_lists_the_target_locales_only():
    body = _body()
    assert "Master: en-US. Targets: de-DE, fr-FR, ja-JP, en-GB, de-CH." in body
    assert "en-US: no formality rule" not in body


def test_render_follows_the_rules_file():
    """The skill is rendered, not hand-copied: a rules change shows up in the text."""
    rules = copy.deepcopy(RULES_FULL)
    rules["glossary"]["do_not_translate"].append("TrailPro Summit")
    rules["locales"]["fr-FR"]["formality"] = "informal"
    body = _body(rules)
    assert "Cyber Monday, TrailPro Summit." in body
    assert "fr-FR: informal (tu)" in body
    assert "fr-FR: formal (vous)" not in body


def test_render_leaves_out_what_the_rules_leave_empty():
    rules = copy.deepcopy(RULES_FULL)
    rules["glossary"]["do_not_translate"] = []
    rules["spelling"]["en-GB"] = {}
    rules["locales"]["fr-FR"]["typography"] = {"guillemets": True}
    body = _body(rules)
    assert "### Do not translate" not in body
    assert "- en-GB: \n" not in body
    assert "- fr-FR: spaces inside guillemets\n" in body


def test_render_replaces_the_marker_with_the_market_rules():
    body = render_market_rules(f"Before\n\n{MARKER}\n\nAfter\n", RULES_FULL)
    assert body.startswith("Before\n\n## Market rules (v1.0, effective 2026-11-13)\n\nMaster:")
    assert body.endswith(" market spelling.\n\nAfter\n")
    assert MARKER not in body


def test_market_rules_skill_keeps_the_template_text_around_the_rules():
    body = _body()
    assert body.startswith("# Market Rules and Glossary\n")
    assert "\n### What the code checks\n" in body
    assert body.index("## Market rules") < body.index("## Judgment rubric")


@pytest.mark.parametrize("template", ["# No marker\n", f"{MARKER}\n{MARKER}\n"])
def test_render_needs_exactly_one_marker(template):
    with pytest.raises(ValueError, match="exactly one <!-- RULES --> marker"):
        render_market_rules(template, RULES_FULL)


def test_every_rule_check_has_a_plain_name():
    """A check added to rules.json fails here until the skill can name it."""
    assert set(CHECK_NAMES) == set(RULES_FULL["severities"])


def test_market_rules_names_what_the_code_checks():
    body = _body()
    for name in ("merge tags", "promo codes", "a time with no time zone", "market spelling"):
        assert name in body


def test_skill_sources_are_ascii():
    for path in (TEMPLATE_FILE, PLAYBOOK_FILE):
        assert path.read_text(encoding="utf-8").isascii(), path.name


def _built():
    return build_skills(SKILLS_DIR, RULES_FULL)


def test_build_skills_gives_both_exports():
    built = _built()
    assert list(built) == ["market-rules-glossary", "translation-fix-playbook"]
    assert built["market-rules-glossary"]["skill"].startswith("# Market Rules and Glossary\n")


def test_market_rules_is_keyword_triggered():
    export = _built()["market-rules-glossary"]
    assert export["title"] == "Market Rules and Glossary"
    assert export["trigger_type"] == "keywords"
    assert export["skill_semantics"] == (
        "localization QA, formality, German copy, French copy, Japanese copy, glossary, "
        "do-not-translate"
    )
    assert export["trigger_tools"] == []


def test_playbook_is_attached_by_copy_fit_check():
    export = _built()["translation-fix-playbook"]
    assert export["title"] == "Fix Playbook"
    assert export["trigger_type"] == "tools"
    assert export["trigger_tools"] == ["copy_fit_check"]
    assert export["skill"].startswith("# Fix Playbook\n")


@pytest.mark.parametrize("shortcut", ["market-rules-glossary", "translation-fix-playbook"])
def test_skill_bodies_hold_no_platform_syntax(shortcut):
    """Mark reads [[x]] as a variable and {skill: ...} as a directive, even in a skill."""
    body = _built()[shortcut]["skill"]
    assert "[[" not in body
    assert "{skill:" not in body
    assert "---" not in body.splitlines()[0]  # front matter stripped


@pytest.mark.parametrize("shortcut", ["market-rules-glossary", "translation-fix-playbook"])
def test_skills_are_unconditional(shortcut):
    """A model may decide an "if this applies" instruction doesn't apply (verified)."""
    body = _built()[shortcut]["skill"].lower()
    for phrase in ("if this skill", "when this skill", "if this applies", "if applicable"):
        assert phrase not in body


def test_skill_export_with_tools():
    assert skill_export("Fix Playbook", "fix-pb", "Body", {"tools": ["copy_fit_check"]}) == {
        "title": "Fix Playbook",
        "skill": "Body",
        "skill_semantics": "",
        "trigger_type": "tools",
        "trigger_tools": ["copy_fit_check"],
        "mention_handle": "fix-pb",
    }


def test_skill_export_with_keywords():
    assert skill_export("Rules", "rules", "Body", {"keywords": "glossary, formality"}) == {
        "title": "Rules",
        "skill": "Body",
        "skill_semantics": "glossary, formality",
        "trigger_type": "keywords",
        "trigger_tools": [],
        "mention_handle": "rules",
    }


@pytest.mark.parametrize("trigger", [{"keywords": "a", "tools": ["b"]}, {}, {"phrases": "a"}])
def test_skill_export_needs_one_trigger(trigger):
    with pytest.raises(ValueError, match="one trigger: keywords or tools"):
        skill_export("Rules", "rules", "Body", trigger)


@pytest.mark.parametrize(
    "source",
    ["# No front matter\n", "---\ntitle: T\nshortcut: other-name\ntools: x\n---\n# Body\n"],
    ids=["missing", "wrong_shortcut"],
)
def test_build_skills_needs_front_matter_naming_the_file(tmp_path, source):
    (tmp_path / "fix-pb.md").write_text(source, encoding="utf-8")
    with pytest.raises(ValueError, match="its shortcut is not the file name: fix-pb.md"):
        build_skills(tmp_path, RULES_FULL)
