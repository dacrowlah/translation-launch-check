"""The seeded test set's catch rate: which planted errors a Mark run caught, which it missed,
and what else it flagged.

Getting a run's findings:
  1. In Mark chat, attach demo/seeded-errors.csv and send
     "@translation_launch_check check this".
  2. When the run is done, open its run log and select the "Score each language" step.
  3. Copy that step's whole output (the JSON object that has a "found" list) into a file,
     for example seeded-run.json.
  4. python scripts/catch_rate.py seeded-run.json [--answers demo/seeded-errors.answers.json]

"found" names each finding as "<locale> <line id> <check>", for example "de-DE L2 dates". An
answer is caught when its "<locale> <line_id> <check>" is in that list; every other entry is
extra, listed once. The result is printed as JSON: caught, missed, extra and the rate.
"""

import argparse
import json
import sys
from pathlib import Path

ANSWERS = Path(__file__).resolve().parents[1] / "demo" / "seeded-errors.answers.json"
NO_FOUND = (
    "{path} isn't a Score step output with a found list: copy the whole output of the "
    '"Score each language" step from the run log into the file.'
)


def answer_key(answer):
    """An answer key entry as the Score step names a finding: "<locale> <line_id> <check>"."""
    return f"{answer['locale']} {answer['line_id']} {answer['check']}"


def catch_rate(found, answers):
    found, keys = list(dict.fromkeys(found)), [answer_key(answer) for answer in answers]
    caught = [key for key in keys if key in found]
    missed = [key for key in keys if key not in found]
    extra = [each for each in found if each not in keys]
    return dict(caught=caught, missed=missed, extra=extra, rate=f"{len(caught)}/{len(keys)}")


def found_in(output):
    """The Score step output's found list (text entries only), or None."""
    found = output.get("found") if isinstance(output, dict) else None
    texts = isinstance(found, list) and all(isinstance(each, str) for each in found)
    return found if texts else None


def _run_found(parser, path):
    """The run's found list; an unreadable file or another shape stops with NO_FOUND."""
    try:
        found = found_in(json.loads(Path(path).read_text(encoding="utf-8")))
    except (OSError, ValueError):
        found = None
    return found if found is not None else parser.error(NO_FOUND.format(path=path))


def _parser():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("scored", help="the Score step's output, saved as JSON")
    parser.add_argument("--answers", default=ANSWERS, help="the answer key (JSON)")
    return parser


def _answers(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def main(argv=None):
    parser = _parser()
    args = parser.parse_args(argv)
    result = catch_rate(_run_found(parser, args.scored), _answers(args.answers))
    sys.stdout.write(json.dumps(result, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
