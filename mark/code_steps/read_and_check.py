"""Step "Read and check the file": pick the source, read the package, validate every rule
(all problems at once), run localization_check once on the whole package, write the facts
to the run folder (check.json) and return one loop item per language.

Inputs (Automatic, narrow): trigger_name, webhook_payload. The CSV comes from the chat
attachment on disk, never from chat's text_content (model-written).
Returns tlc_route_check {campaign, source, run_key, check_checksum, locales, summary} or
tlc_route_needs_info {problems, campaign, summary}.
"""

from pathlib import Path

from _campaign import UNTITLED, campaign_from, clean_campaign
from _check_facts import check_facts, master_problems
from _checksum import facts_checksum
from _config import PRIVATE, RULES
from _csv_package import parse_csv
from _loop_items import loop_item, size_problems
from _model_output import json_object
from _routes import ROUTE_CHECK, ROUTE_NEEDS_INFO, defused
from _run_folder import CHECK_FILE, new_run_key, run_root, write_run_file
from _shared import call_tool, run_safely
from _text import TEXT
from _text_problems import MAX_SHOWN_PROBLEMS, PROBLEM_FIELD_CHARS, file_problem, our_side
from _tool_report import usable_report
from _webhook_package import from_webhook


def _summary(problems):
    if our_side(problems):
        return TEXT["summary_not_run"]
    return TEXT["summary_needs_info"].format(count=len(problems))


def _short(problem):
    return {key: value[:PROBLEM_FIELD_CHARS] for key, value in problem.items()}


def needs_info_route(problems, campaign):
    """At most MAX_SHOWN_PROBLEMS problems, each field at most PROBLEM_FIELD_CHARS, and a
    count of the rest: the needs-info step's input stays within its budget. The campaign is
    defused: the condition reads this output."""
    shown = [_short(problem) for problem in problems[:MAX_SHOWN_PROBLEMS]]
    more = len(problems) - len(shown)
    shown += [file_problem("more_problems", count=more)] if more else []
    head = {"route": ROUTE_NEEDS_INFO, "problems": shown, "campaign": defused(campaign)}
    return {**head, "summary": _summary(problems)}


def _source(name, campaign, parsed):
    return {"source": name, "campaign": campaign, "pkg": parsed[0], "problems": parsed[1]}


def _rejected(key, campaign=UNTITLED):
    return _source("none", campaign, (None, [file_problem(key)]))


def _read_bytes(path):
    try:
        return path.read_bytes()
    except OSError:
        return None


def _from_file(path):
    raw = _read_bytes(path) if path.name.lower().endswith(".csv") else None
    if raw is None:
        return _rejected("attach_one", campaign_from(path.name))
    return _source("chat", campaign_from(path.name), parse_csv(raw, path.name, RULES))


def _attachments(ctx):
    folder = ctx.get("input_dir") if isinstance(ctx, dict) else None
    try:
        return sorted(p for p in (Path(folder) / "attachments").iterdir() if p.is_file())
    except (OSError, TypeError):
        return []


def _webhook(payload):
    campaign = clean_campaign((json_object(payload) or {}).get("campaign"))
    return _source("webhook", campaign, from_webhook(payload, RULES))


def _is_webhook_run(trigger):
    webhook = PRIVATE["webhook_trigger_name"]
    return webhook is not None and trigger == webhook


def _from_trigger(input_):
    """No attachment: an email run can't carry the file yet. A payload counts only on a run
    of the configured webhook trigger (a missing or unknown name never does); the checksum
    then proves it arrived unchanged. Everything else is asked to attach the file."""
    trigger, payload = input_.get("trigger_name"), input_.get("webhook_payload")
    if trigger == "Email":
        return _rejected("email_not_supported")
    usable = _is_webhook_run(trigger) and bool(payload)
    return _webhook(payload) if usable else _rejected("attach_one")


def _read_source(input_, ctx):
    files = _attachments(ctx)
    if len(files) == 1:
        return _from_file(files[0])
    return _rejected("attach_one") if files else _from_trigger(input_)


def _check_output(facts, items, run_key):
    head = {"route": ROUTE_CHECK, "campaign": facts["campaign"], "source": facts["source"]}
    keys = {"run_key": run_key, "check_checksum": facts_checksum(facts), "locales": items}
    return {**head, **keys, "summary": TEXT["summary_checked"].format(count=len(items))}


def _saved(facts, items, ctx):
    run_key = new_run_key()
    if write_run_file(run_key, CHECK_FILE, facts, root=run_root(ctx)) != "ok":
        return needs_info_route([file_problem("internal")], facts["campaign"])
    return _check_output(facts, items, run_key)


def _facts_and_items(pkg, body, source):
    facts = check_facts(pkg, body, source)
    return facts, [loop_item(facts["master_lines"], each) for each in facts["locales"]]


def _reported(pkg, body, source, ctx):
    facts, items = _facts_and_items(pkg, body, source)
    problems = master_problems(body, pkg) + size_problems(items, facts["master_lines"])
    return needs_info_route(problems, pkg["campaign"]) if problems else _saved(facts, items, ctx)


def _run_checks(pkg, source, ctx):
    result = call_tool("localization_check", **pkg)
    if not usable_report(result["body"], pkg["locales"]):  # body is None unless ok
        return needs_info_route([file_problem("tool_down")], pkg["campaign"])
    return _reported(pkg, result["body"], source, ctx)


def read_and_check(input_, ctx):
    read = _read_source(input_ if isinstance(input_, dict) else {}, ctx)
    if read["problems"]:
        return needs_info_route(read["problems"], read["campaign"])
    return _run_checks(read["pkg"], read["source"], ctx)


def handler(input: dict, ctx: dict) -> dict:  # noqa: A002 - the platform's signature
    return run_safely(read_and_check, input, ctx)
