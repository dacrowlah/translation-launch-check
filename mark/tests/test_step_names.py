"""The build inlines each step's helpers (transitively) into the step's own file, so a name
the step binds at module level must not be bound by any helper it inlines: the step's later
definition would silently replace the helper's, for the helpers' own calls too."""

import ast

import pytest

from builders import CODE_STEPS, a_module_file
from test_inlining import clashes

STEPS = sorted(path for path in CODE_STEPS.glob("*.py") if not path.name.startswith("_"))


def _helper_imports(path):
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found = (node.module for node in ast.walk(tree) if isinstance(node, ast.ImportFrom))
    return {name for name in found if name and (path.parent / f"{name}.py").is_file()}


def inlined(path, seen=None):
    """Every helper module the step inlines, each once, following helper imports."""
    seen = set() if seen is None else seen
    for name in sorted(_helper_imports(path) - seen):
        seen.add(name)
        inlined(path.parent / f"{name}.py", seen)
    return seen


def test_the_steps_are_the_five_code_steps():
    assert [path.stem for path in STEPS] == [
        "needs_info",
        "read_and_check",
        "report",
        "save_review",
        "score",
    ]


@pytest.mark.parametrize("step", STEPS, ids=lambda path: path.stem)
def test_a_step_binds_no_name_its_helpers_bind(step):
    helpers = [CODE_STEPS / f"{name}.py" for name in sorted(inlined(step))]
    assert helpers and clashes([*helpers, step]) == []


def test_a_step_name_that_shadows_a_helper_is_caught(tmp_path):
    a_module_file(tmp_path, "_h.py", ["def _read():", "    return 1"])
    step = a_module_file(tmp_path, "s.py", ["from _h import _read", "def _read():", "    return 2"])
    assert inlined(step) == {"_h"} and clashes([tmp_path / "_h.py", step]) == ["_read"]
