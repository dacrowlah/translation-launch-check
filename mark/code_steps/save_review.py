"""Step "Save the review", the last step of each loop iteration: writes this language's two
agent answers to the run folder (reviews/<locale>.json) for "Score each language".

Inputs (Automatic, all small): run_key, locale and checksum from the loop item; review
(Translation Review's output, an object or JSON text) and back_translation (Content
Translation's text); either may arrive as the agent's whole execution record, so each is
stored as its answer (the review as an object, or null). Never the loop item itself: it
would count against the input cap.
It never fails (one failed iteration stops the workflow); a file it couldn't write is
missing later, which makes that language check_incomplete. Score checks everything it
reads, so this step only strips the translation leak and writes.
"""

from _agent_output import agent_answer, agent_text
from _run_folder import run_root, write_run_file
from _shared import run_safely
from _text import TEXT

LEAK = "[[file]] (at least one needed)"  # Content Translation's observed English leak


def _drop_leak_or(head):
    """The leak's own "or": the last word, after any whitespace (NBSP, newline) or alone."""
    if head == "or" or (head.endswith("or") and head[-3:-2].isspace()):
        return head[:-2].rstrip()
    return head


def strip_translation_leak(text):
    """Removes LEAK at the very end (trailing whitespace ignored) and the one "or" before
    it; nothing else, in linear time. A real "or" right before the marker can't be told
    from the leak's own and goes too (known limit)."""
    body = text.rstrip() if isinstance(text, str) else ""
    return _drop_leak_or(body[: -len(LEAK)].rstrip()) if body.endswith(LEAK) else text


def leak_free_text(text):
    """The back-translation without the leak, or None when nothing usable is left."""
    result = strip_translation_leak(text)
    return result if isinstance(result, str) and result.strip() else None


def _record(input_):
    locale, answers = input_.get("locale"), {"review": agent_answer(input_.get("review"))}
    answers["back_translation"] = leak_free_text(agent_text(input_.get("back_translation")))
    return {"locale": locale, "checksum": input_.get("checksum"), **answers}


def save_review(input_, ctx):
    record, root = _record(input_), run_root(ctx)
    name = f"reviews/{record['locale']}.json"
    saved = write_run_file(input_.get("run_key"), name, record, root=root) == "ok"
    return {"saved": saved, "summary": TEXT["summary_saved" if saved else "summary_not_saved"]}


def handler(input: dict, ctx: dict) -> dict:  # noqa: A002 - the platform's signature
    fallback = {"saved": False, "summary": TEXT["summary_not_saved"]}
    return run_safely(save_review, input, ctx, fallback)
