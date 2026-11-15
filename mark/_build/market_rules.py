"""The market rules part of the Market Rules and Glossary skill, rendered from
tool/config/rules.json, the file the tool's checks run on, so the agents' rules and the
code's checks cannot drift apart. Each section builder takes the rules and returns its text,
or "" when the rules give it nothing to say."""

MARKER = "<!-- RULES -->"

# Each rule check in plain words, keyed like rules.json "severities". A new check fails
# test_every_rule_check_has_a_plain_name until it is named here.
CHECK_NAMES = {
    "numbers": "numbers, percentages and clock times",
    "currency_amount": "prices",
    "currency_code": "currencies",
    "dates": "dates",
    "weekday_date_match": "weekdays against their dates",
    "merge_tags": "merge tags",
    "url_params": "links and their tracking parameters",
    "url_path": "link paths",
    "promo_codes": "promo codes",
    "template_leftovers": "placeholder and prompt text left in the copy",
    "length_hard": "channel length limits",
    "length_soft": "channel length limits",
    "formality": "formality pronouns and verb forms",
    "glossary_forbidden": "forbidden terms (the listed form)",
    "glossary_dnt": "do-not-translate terms",
    "untranslated": "lines left identical to the master",
    "language_column": "the language of each column",
    "language_line": "the language of each long line",
    "typography": "French typography",
    "length_ratio": "length against the master",
    "trademark_symbols": "trademark symbols",
    "markup": "HTML tags",
    "time_zone": "a time with no time zone",
    "locale_spelling": "market spelling",
}
APPROVED_INTRO = "Each replaces a do-not-translate term in its locale; both forms pass."
FORBIDDEN_INTRO = "Never use these. The exact form is the code's finding; other forms count too."
LOANWORDS_INTRO = "Normal in the market's copy: these and similar loanwords are never untranslated."


def render_market_rules(template: str, rules: dict) -> str:
    """The template with its <!-- RULES --> marker replaced by the rendered market rules."""
    if template.count(MARKER) != 1:
        raise ValueError("the template needs exactly one <!-- RULES --> marker")
    parts = (build(rules) for build in SECTIONS)
    return template.replace(MARKER, "\n\n".join(part for part in parts if part))


def _section(title, lines, intro=""):
    lines = [line for line in lines if line]
    head = [f"### {title}", intro] if intro else [f"### {title}"]
    return "\n".join([*head, *lines]) if lines else ""


def _targets(rules):
    return [code for code in rules["locales"] if code != rules["master_locale"]]


def _heading(rules):
    head = f"## Market rules (v{rules['version']}, effective {rules['effective_date']})"
    return f"{head}\n\nMaster: {rules['master_locale']}. Targets: {', '.join(_targets(rules))}."


def _formality(rules):
    return _section("Formality", [_formality_line(code, rules) for code in _targets(rules)])


def _formality_line(code, rules):
    rule = rules["locales"][code]["formality"]
    if rule == "not_applicable":
        return f"- {code}: no formality rule; judge register as tone"
    return f"- {code}: {rule}{_pronoun(code, rule, rules)}"


def _pronoun(code, rule, rules):
    language = rules["locales"][code]["language"]
    markers = rules["formality_markers"].get(language, {}).get(rule, [])
    return f" ({markers[0]})" if markers else ""


def _spelling(rules):
    lines = [_spelling_line(code, rule) for code, rule in rules["spelling"].items()]
    return _section("Market spelling", lines)


def _spelling_line(code, rule):
    pairs = _examples(rule.get("words", {}).items())
    pairs += [("-ize", "-ise")] if rule.get("ize_to_ise") else []
    pairs += list(rule.get("chars", {}).items())
    return f"- {code}: " + "; ".join(f"{new}, not {old}" for old, new in pairs) if pairs else ""


def _examples(pairs, count=3):
    """The first `count` (US, local) word pairs whose local word is not a form of an earlier
    one (colour, not colours)."""
    picked = []
    for old, new in pairs:
        if len(picked) < count and not any(new.startswith(p) for _, p in picked):
            picked.append((old, new))
    return picked


def _typography(rules):
    rule_of = {code: rules["locales"][code].get("typography", {}) for code in _targets(rules)}
    return _section("Typography", [_typography_line(code, rule) for code, rule in rule_of.items()])


def _typography_line(code, rule):
    spaces = rule.get("space_before")
    parts = [f"a space before {' '.join(spaces)}"] if spaces else []
    parts += ["spaces inside guillemets"] if rule.get("guillemets") else []
    return f"- {code}: {' and '.join(parts)}" if parts else ""


def _do_not_translate(rules):
    terms = ", ".join(rules["glossary"]["do_not_translate"])
    lines = [f"Keep these exactly as written: {terms}."] if terms else []
    return _section("Do not translate", lines)


def _approved(rules):
    lines = [_approved_line(*entry) for entry in rules["glossary"]["approved_translations"].items()]
    return _section("Approved translations", lines, APPROVED_INTRO)


def _approved_line(code, terms):
    return f"- {code}: " + "; ".join(f"{term} may be written {terms[term]}" for term in terms)


def _forbidden(rules):
    found = rules["glossary"]["forbidden"].items()
    lines = [f"- {code}: {', '.join(terms)}" for code, terms in found if terms]
    return _section("Forbidden terms", lines, FORBIDDEN_INTRO)


def _loanwords(rules):
    lines = [_loanword_line(rules, *entry) for entry in rules["accepted_loanwords"].items()]
    return _section("English words accepted in copy", lines, LOANWORDS_INTRO)


def _loanword_line(rules, language, words):
    codes = [code for code in _targets(rules) if rules["locales"][code]["language"] == language]
    return f"- {language} ({', '.join(codes)}): {', '.join(words)}" if words and codes else ""


def _what_the_code_checks(rules):
    names = dict.fromkeys(CHECK_NAMES[check] for check in rules["severities"])
    return f"### What the code checks\nOn every line, against the master: {'; '.join(names)}."


GLOSSARY_SECTIONS = (_do_not_translate, _approved, _forbidden, _loanwords, _what_the_code_checks)
SECTIONS = (_heading, _formality, _spelling, _typography, *GLOSSARY_SECTIONS)
