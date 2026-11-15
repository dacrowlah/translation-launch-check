"""The parse chain runs outside Mark too: scripts/send_package.py imports _csv_package,
_webhook_package and _checksum on the owner's laptop, with no opal_tms_sdk and no private
config. So those modules, and every helper they import, must load with the standard library
alone. Checked in a fresh interpreter (-I: no PYTHONPATH, no user site), from an empty
folder, with only code_steps on sys.path."""

import json
import subprocess
import sys

from builders import CODE_STEPS, MARK_DIR

PROBE = """
import json, sys
sys.path.insert(0, sys.argv[1])
import _checksum, _csv_package, _webhook_package
rules = json.load(open(sys.argv[2], encoding="utf-8"))
raw = b"id,channel,field,en-US,de-DE\\nL1,email,subject,Hi,Hallo\\n"
pkg, problems = _csv_package.parse_csv(raw, "Sale.csv", rules)
unwanted = ("opal_tms_sdk", "_config", "_shared", "_platform")
digest = _checksum.sha256_hex(pkg)
webhook = _webhook_package.from_webhook({**pkg, "package_sha256": digest}, rules)[1]
loaded = sorted(name for name in sys.modules if name in unwanted)
print(json.dumps({"loaded": loaded, "problems": problems, "digest": digest, "webhook": webhook}))
"""


def probe(tmp_path):
    rules = MARK_DIR.parent / "tool" / "config" / "rules.json"
    args = [sys.executable, "-I", "-c", PROBE, str(CODE_STEPS), str(rules)]
    # S603: our own interpreter running a fixed probe; env={} keeps TLC_CONFIG out.
    done = subprocess.run(args, cwd=tmp_path, capture_output=True, text=True, env={})  # noqa: S603
    assert done.returncode == 0, done.stderr
    return json.loads(done.stdout)


def test_the_parse_chain_loads_without_the_sdk_or_any_config(tmp_path):
    found = probe(tmp_path)
    assert found["loaded"] == [] and found["problems"] == [] and found["webhook"] == []
    assert len(found["digest"]) == 64
