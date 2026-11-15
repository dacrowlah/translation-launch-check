"""Values that arrive through the orchestrator model or from an agent: JSON given as an
object or as JSON text, and model-written text, shortened and with any route token defused
(it can reach the output a condition reads). Nothing here raises."""

import json

from _routes import defused

MAX_MODEL_TEXT = 500  # model-written text kept per field


def _loaded(text):
    try:
        return json.loads(text)
    except (ValueError, RecursionError):
        return None


def json_object(raw):
    """A dict as given, or the dict a JSON text holds; None for anything else (prose, a
    fenced block, a list)."""
    value = _loaded(raw) if isinstance(raw, str) else raw
    return value if isinstance(value, dict) else None


def model_text(value):
    """Model-written text, shortened; "" for anything that isn't text."""
    return defused(value.strip()[:MAX_MODEL_TEXT]) if isinstance(value, str) else ""
