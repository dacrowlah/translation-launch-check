"""The locale columns of a package: the master must be the rules' master, then 1 to
max_targets supported target locales, each once. A near miss gets a suggestion. Nothing here
raises."""

from _text_problems import header_problem, shown

FIRST_TARGET_COLUMN = 5  # id, channel, field and the master come first


def target_locales(rules):
    return [code for code in rules["locales"] if code != rules["master_locale"]]


def suggest_locale(name, rules):
    """The locale a near miss probably means: a case-insensitive match ("_" read as "-"),
    then an alias."""
    lowered = name.strip().lower().replace("_", "-")
    exact = {code.lower(): code for code in target_locales(rules)}
    aliases = {alias.lower(): code for alias, code in rules["locale_aliases"].items()}
    return exact.get(lowered) or aliases.get(lowered)


def _unknown_locale(locale, rules):
    guess, name = suggest_locale(locale, rules), shown(locale)
    if guess:
        return header_problem("unknown_locale", locale=name, suggestion=guess)
    known = ", ".join(target_locales(rules))
    return header_problem("unknown_locale_list", locale=name, known=known)


def _listed_problem(locale, earlier, rules):
    if locale == rules["master_locale"]:
        return header_problem("master_repeated", master=locale)
    if locale in earlier:
        return header_problem("duplicate_locale", locale=shown(locale))
    return None if locale in target_locales(rules) else _unknown_locale(locale, rules)


def _locale_problem(locale, index, locales, rules):
    if not locale.strip():
        return header_problem("blank_column", number=index + FIRST_TARGET_COLUMN)
    return _listed_problem(locale, locales[:index], rules)


def _each_locale(locales, rules):
    found = (_locale_problem(each, index, locales, rules) for index, each in enumerate(locales))
    return [each for each in found if each]


def _count_problems(locales, limit):
    if not locales:
        return [header_problem("no_targets")]
    over = len(locales) > limit
    return [header_problem("too_many_targets", count=len(locales), limit=limit)] if over else []


def _master_column_problem(given, master):
    if not given.strip():
        return header_problem("blank_column", number=FIRST_TARGET_COLUMN - 1)
    found = shown(given)
    return None if given == master else header_problem("bad_master", master=master, found=found)


def _master_problems(pkg, rules):
    found = _master_column_problem(pkg["master_locale"], rules["master_locale"])
    return [found] if found else []


def locale_problems(pkg, rules):
    locales = pkg["locales"]
    counted = _count_problems(locales, rules["limits"]["max_targets"])
    return _master_problems(pkg, rules) + (counted or _each_locale(locales, rules))
