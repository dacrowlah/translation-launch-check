"""Sends a localization CSV to the workflow's webhook trigger, as CMP's step would.

    python scripts/send_package.py demo/black-friday-errors.csv            # prints "HTTP <status>"
    python scripts/send_package.py demo/black-friday-errors.csv --dry-run  # prints the payload

The file is read by the workflow's own parse_csv: a file with problems lists them and sends
nothing. The payload is the package plus package_sha256, the full SHA-256 of the package's
canonical JSON, which "Read and check the file" verifies. The webhook's url, auth_header and
auth_key come from scripts.webhook in mark/local.config.json (gitignored). Nothing secret is
ever printed: a send prints the HTTP status only. Redirects are never followed (urllib would
resend the auth header to the new address); a 30x is reported as its status.
"""

import argparse
import json
import sys
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "mark" / "code_steps"))

from _checksum import sha256_hex  # noqa: E402
from _csv_package import parse_csv  # noqa: E402

CONFIG_FILE = REPO / "mark" / "local.config.json"
DEMO = REPO / "demo"
RULES = json.loads((REPO / "tool" / "config" / "rules.json").read_text(encoding="utf-8"))
WEBHOOK_KEYS = ("url", "auth_header", "auth_key")
PLACEHOLDER_KEY = "replace-me"  # local.config.example.json's auth_key
TIMEOUT_S = 30
NO_WEBHOOK = (
    "No webhook configured: add scripts.webhook with url (https://...), auth_header and "
    "auth_key to mark/local.config.json, as in mark/local.config.example.json. Nothing was sent."
)
NO_ANSWER = "No answer from the webhook (network error). Check the run log before sending again."


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """Refuses every redirect, so a 30x surfaces as an HTTPError with its status."""

    def redirect_request(self, *_request):
        return None


OPENER = urllib.request.build_opener(NoRedirect)


def _say(text):
    sys.stdout.write(text + "\n")


def read_package(path, rules=RULES):
    """(package, []) for a valid CSV, else (None, every problem): exactly as the workflow."""
    return parse_csv(Path(path).read_bytes(), Path(path).name, rules)


def webhook_payload(package):
    """The package plus package_sha256 over its canonical JSON."""
    return {**package, "package_sha256": sha256_hex(package)}


def _usable(hook):
    texts = isinstance(hook, dict) and all(isinstance(hook.get(k), str) for k in WEBHOOK_KEYS)
    filled = texts and all(hook[key].strip() for key in WEBHOOK_KEYS)
    return filled and hook["url"].startswith("https://") and hook["auth_key"] != PLACEHOLDER_KEY


def _read_json(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def webhook_config(path):
    """scripts.webhook from the private config file, or None if it is missing or unusable."""
    full = _read_json(path)
    scripts = full.get("scripts") if isinstance(full, dict) else None
    hook = scripts.get("webhook") if isinstance(scripts, dict) else None
    return hook if _usable(hook) else None


def _request(payload, hook):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = {"Content-Type": "application/json", hook["auth_header"]: hook["auth_key"]}
    # S310: webhook_config admits only an https:// url.
    return urllib.request.Request(hook["url"], data=body, headers=headers, method="POST")  # noqa: S310


def post(payload, hook, opener=OPENER.open):
    """The HTTP status of one POST (an error or redirect status too), or None when no answer
    came (no connection, a timeout, a dropped connection: every OSError)."""
    try:
        with opener(_request(payload, hook), timeout=TIMEOUT_S) as response:
            return response.status
    except OSError as error:  # an HTTPError (an OSError) carries the status as code
        return getattr(error, "code", None)


def _rejected(problems):
    _say("\n".join(f"{p['where']}: {p['message']} {p['suggestion']}".rstrip() for p in problems))
    return 1


def _dry_run(payload):
    _say(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


def _sent(status):
    _say(NO_ANSWER if status is None else f"HTTP {status}")
    return 0 if status is not None and 200 <= status < 300 else 2


def _deliver(payload, config_path, opener):
    hook = webhook_config(config_path)
    if hook is None:
        _say(NO_WEBHOOK)
        return 2
    return _sent(post(payload, hook, opener))


def send(args, config_path, opener):
    """Exit code: 0 accepted (HTTP 2xx) or a dry run, 1 the file has problems, 2 no usable
    webhook config, no answer, or an error or redirect status."""
    package, problems = read_package(args.csv)
    if problems:
        return _rejected(problems)
    payload = webhook_payload(package)
    return _dry_run(payload) if args.dry_run else _deliver(payload, config_path, opener)


def _parser():
    parser = argparse.ArgumentParser(description="Send a localization CSV to the webhook.")
    parser.add_argument("csv", help="the localization CSV to send")
    parser.add_argument("--dry-run", action="store_true", help="print the payload, send nothing")
    return parser


def main(argv=None, config_path=CONFIG_FILE, opener=OPENER.open):
    return send(_parser().parse_args(argv), config_path, opener)


if __name__ == "__main__":
    sys.exit(main())
