"""Organization skills: mark/skills/*.md to the skill export JSON.

Each source starts with front matter (title, shortcut, and keywords or tools for "When to
use"). A `.template.md` source has one <!-- RULES --> marker, replaced with the market rules
rendered from tool/config/rules.json (`market_rules.py`).
"""

from pathlib import Path

from _build.market_rules import render_market_rules

EXPORT_KEYS = ("title", "skill", "skill_semantics", "trigger_type", "trigger_tools")


def skill_export(title: str, shortcut: str, body: str, trigger: dict) -> dict:
    """The skill export JSON. `trigger` is {"keywords": "<phrases>"} or {"tools": [names]}."""
    kind = _trigger_kind(trigger)
    semantics, tools = (trigger[kind], []) if kind == "keywords" else ("", list(trigger[kind]))
    values = (title, body, semantics, kind, tools)
    return {**dict(zip(EXPORT_KEYS, values, strict=True)), "mention_handle": shortcut}


def build_skills(skills_dir: Path, rules: dict) -> dict:
    """Every skill under skills_dir as {shortcut: export JSON}, in file-name order."""
    return dict(_skill(path, rules) for path in sorted(skills_dir.glob("*.md")))


def _trigger_kind(trigger):
    if len(trigger) != 1 or not set(trigger) <= {"keywords", "tools"}:
        raise ValueError("a skill needs one trigger: keywords or tools")
    return next(iter(trigger))


def _skill(path, rules):
    meta, body = _front_matter(path)
    if path.name.endswith(".template.md"):
        body = render_market_rules(body, rules)
    return meta["shortcut"], skill_export(meta["title"], meta["shortcut"], body, _trigger(meta))


def _trigger(meta):
    if "keywords" in meta:
        return {"keywords": meta["keywords"]}
    return {"tools": [name.strip() for name in meta["tools"].split(",")]}


def _front_matter(path):
    """({key: value}, body) of a source whose first lines are `---`, `key: value`..., `---`.
    The shortcut must be the file name's first part."""
    head, sep, body = path.read_text(encoding="utf-8").removeprefix("---\n").partition("\n---\n")
    meta = dict(line.split(": ", 1) for line in head.splitlines()) if sep else {}
    if meta.get("shortcut") != path.name.split(".")[0]:
        raise ValueError("no front matter, or its shortcut is not the file name: " + path.name)
    return meta, body.lstrip("\n")
