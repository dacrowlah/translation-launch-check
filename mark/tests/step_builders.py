"""Builders for the code steps' inputs, in today's shapes: the localization CSV, the
package, the tool's LocalizationReport (docs/contract/TOOL_CONTRACT.md) and the agents'
answers. Imported by tests after conftest has put code_steps and the fake on sys.path."""

import csv
import io

import read_and_check
import save_review
import score
from _checksum import sha256_hex
from _config import RULES
from _run_folder import read_verified, run_root
from builders import EXAMPLE_WEBHOOK

HEADER = ["id", "channel", "field", "en-US", "de-DE"]
ROWS = [
    ["L1", "email", "subject", "Up to 30% off jackets", "Bis zu 30 % auf Jacken"],
    ["L2", "email", "body", "Hi {{first_name}}", "Hallo {{first_name}}"],
]
BOM = b"\xef\xbb\xbf"


def a_csv(rows=None, header=None, **style):
    """The CSV bytes a spreadsheet would save; csv.writer quotes cells with line breaks.
    style: delimiter (","), bom (False), crlf (False)."""
    out, ending = io.StringIO(), "\r\n" if style.get("crlf") else "\n"
    writer = csv.writer(out, delimiter=style.get("delimiter", ","), lineterminator=ending)
    writer.writerows([header or HEADER, *(ROWS if rows is None else rows)])
    return (BOM if style.get("bom") else b"") + out.getvalue().encode("utf-8")


def a_line(line_id="L1", channel="email", field="subject", **texts):
    return {"id": line_id, "channel": channel, "field": field, "texts": texts}


def a_package(locales=("de-DE",), lines=None, campaign="Black Friday 2026"):
    """A valid package: the two ROWS, in the given locales (each copies the de-DE text)."""
    rows = ROWS if lines is None else lines
    built = [_package_line(row, locales) for row in rows] if lines is None else rows
    return {
        "campaign": campaign,
        "master_locale": "en-US",
        "locales": list(locales),
        "lines": built,
    }


def _package_line(row, locales):
    texts = {"en-US": row[3], **{locale: row[4] for locale in locales}}
    return a_line(row[0], row[1], row[2], **texts)


def problems_of(result):
    """The messages of parse_csv's or validate_package's problems, in order."""
    problems = result[1] if isinstance(result, tuple) else result
    return [each["message"] for each in problems]


def all_checks(status="verified"):
    """Every check id the tool reports for a checked locale (rules.json severities' keys)."""
    return {check: status for check in RULES["severities"]}


def a_finding(check="numbers", severity="blocker", confidence="certain", **values):
    """A tool finding. values: detail, expected, found."""
    detail = values.get("detail", f"{check} differs from the master.")
    found = {"expected": values.get("expected"), "found": values.get("found")}
    return {
        "check": check,
        "severity": severity,
        "detail": detail,
        **found,
        "confidence": confidence,
    }


def _report_line(line, locale, findings):
    found = findings.get((locale, line["id"]), [])
    length = {"value": len(line["texts"][locale]), "limit": None, "unit": "chars"}
    return {"id": line["id"], "length": length, "findings": found, "spelling_fix": None}


def a_locale_report(pkg, locale, findings, checks):
    lines = [_report_line(line, locale, findings) for line in pkg["lines"]]
    column = findings.get((locale, None), [])
    return {
        "locale": locale,
        "status": "checked",
        "column_findings": column,
        "lines": lines,
        "checks": checks,
    }


def a_tool_report(pkg, findings=None):
    """The tool's LocalizationReport for pkg. findings: {(locale, line id or None): [...]}."""
    found = findings or {}
    master_checks = {"language_column": "verified", "language_line": "verified"}
    master = a_locale_report(pkg, "en-US", found, master_checks)
    locales = [a_locale_report(pkg, locale, found, all_checks()) for locale in pkg["locales"]]
    return {
        "rules": {"version": "1.0", "effective_date": "2026-11-13"},
        "master": master,
        "locales": locales,
    }


def a_ctx(tmp_path):
    """The step's ctx, with the run folder under tmp_path (Mark's ctx has no run_root)."""
    (tmp_path / "input" / "attachments").mkdir(parents=True, exist_ok=True)
    folders = {"input_dir": str(tmp_path / "input"), "output_dir": str(tmp_path / "output")}
    return {**folders, "run_root": str(tmp_path / "tlc")}


def attach(tmp_path, name, raw):
    """A chat attachment as Mark leaves it: input_dir/attachments/<name>, byte-exact."""
    ctx = a_ctx(tmp_path)
    (tmp_path / "input" / "attachments" / name).write_bytes(raw)
    return ctx


def a_webhook_input(pkg):
    """A webhook run's step input: the configured trigger name and the signed package."""
    return {"trigger_name": EXAMPLE_WEBHOOK, "webhook_payload": a_payload(pkg)}


def a_payload(pkg, checksum=None):
    """A webhook payload: the package plus package_sha256 (the sender recipe, _checksum)."""
    return {**pkg, "package_sha256": checksum or sha256_hex(pkg)}


def a_review_finding(line_id="L1", check="meaning", severity="blocker", **texts):
    """One Translation Review finding. texts: detail, evidence."""
    detail = texts.get("detail", "The offer changed.")
    return {
        "line_id": line_id,
        "check": check,
        "severity": severity,
        "detail": detail,
        "evidence": texts.get("evidence", ""),
    }


def a_review(item, findings=(), rule_checks=()):
    """Translation Review's answer for a loop item: it echoes the item's locale and checksum."""
    echo = {"locale": item["locale"], "checksum": item["checksum"]}
    return {**echo, "findings": list(findings), "rule_checks": list(rule_checks)}


def a_rule_check(finding_id, opinion="same_meaning", reason="Same price, written differently."):
    return {"finding_id": finding_id, "opinion": opinion, "reason": reason}


def a_checked_run(fake_tools, ctx, findings=None, pkg=None):
    """The real "Read and check the file" output for pkg (sent by webhook)."""
    pkg = pkg or a_package()
    fake_tools.respond("localization_check", ok_body(a_tool_report(pkg, findings)))
    return read_and_check.handler(a_webhook_input(pkg), ctx)


def save(ctx, checked, item, **answers):
    """The real "Save the review" for one loop item. answers: review (default: a clean
    review), back_translation (default: a plain one)."""
    review = answers.get("review", a_review(item))
    back = answers.get("back_translation", "[L1] Up to 30% off jackets")
    keys = {"run_key": checked["run_key"], "locale": item["locale"], "checksum": item["checksum"]}
    return save_review.handler({**keys, "review": review, "back_translation": back}, ctx)


def scored(ctx, checked):
    """The real "Score each language" output and the scores.json it wrote (or None)."""
    out = score.handler(
        {"run_key": checked["run_key"], "check_checksum": checked["check_checksum"]}, ctx
    )
    stored = read_verified(
        out["run_key"], "scores.json", out["verdict_checksum"], root=run_root(ctx)
    )
    return out, stored["data"]


def ok_body(report):
    """localization_check's success: the report with status ok, in the success envelope."""
    return {"response_type": "application/json", "response": {**report, "status": "ok"}}


def a_scored_run(fake_tools, ctx, findings=None, pkg=None):
    """Read and check (by webhook), a clean saved review per language, then Score: the real
    steps. Returns Score's output (the report step's input, without fixes)."""
    checked = a_checked_run(fake_tools, ctx, findings, pkg)
    for item in checked["locales"]:
        save(ctx, checked, item)
    out = score.handler(
        {"run_key": checked["run_key"], "check_checksum": checked["check_checksum"]}, ctx
    )
    return {"run_key": out["run_key"], "verdict_checksum": out["verdict_checksum"]}


def a_fix(locale="de-DE", line_id="L1", text="Bis zu 30 % auf alle Jacken"):
    return {"locale": locale, "line_id": line_id, "suggested_text": text, "fits": True, "note": ""}
