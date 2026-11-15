"""The inliner on planted modules: dependency order, each helper once, multi-line imports,
_config as literals, and every refused form."""

import pytest

from _build.inline import InlineError, helper_order, inline
from builders import a_module_file

CONFIG = {"RULES": {"limits": {"max_targets": 5}}, "PRIVATE": {"qa_inbox": "qa@example.com"}}


def plant(folder, modules):
    """Writes {name: lines}; returns the step's path (the module without a leading _)."""
    paths = {name: a_module_file(folder, f"{name}.py", lines) for name, lines in modules.items()}
    return next(path for name, path in paths.items() if not name.startswith("_"))


def run(code):
    namespace = {}
    exec(compile(code, "built", "exec"), namespace)  # noqa: S102 - our own built test code
    return namespace


NESTED = {
    "_c": ["C = 3"],
    "_b": ["from _c import C", "B = C + 1"],
    "_a": ["from _b import B", "from _c import C", "A = B + C"],
    "step": [
        "from _a import A",
        "from _b import B",
        "def handler(input, ctx):",
        "    return A + B",
    ],
}


def test_helpers_come_once_each_after_their_own_dependencies(tmp_path):
    step = plant(tmp_path, NESTED)
    assert helper_order(step) == ["_c", "_b", "_a"]
    code = inline(step, CONFIG)
    assert [code.count(text) for text in ("C = 3", "B = C + 1", "A = B + C")] == [1, 1, 1]
    assert run(code)["handler"]({}, {}) == 11


def test_a_parenthesized_multi_line_import_is_removed_whole(tmp_path):
    modules = {
        "_h": ["X = 1", "Y = 2"],
        "step": ["from _h import (", "    X,", "    Y,", ")", "Z = X + Y"],
    }
    code = inline(plant(tmp_path, modules), CONFIG)
    assert "from _h" not in code and "    X," not in code and run(code)["Z"] == 3


def test_config_becomes_literals_and_its_own_imports_are_not_followed(tmp_path):
    modules = {
        "_url": ["U = 1"],
        "_config": ["import os", "from _url import U", "RULES = {}", "PRIVATE = {}"],
    }
    step = plant(
        tmp_path,
        {**modules, "step": ["from _config import PRIVATE, RULES", "Q = PRIVATE['qa_inbox']"]},
    )
    code = inline(step, CONFIG)
    assert helper_order(step) == ["_config"] and "import os" not in code and "_url" not in code
    assert run(code)["Q"] == "qa@example.com" and run(code)["RULES"] == CONFIG["RULES"]


def test_standard_library_imports_stay(tmp_path):
    lines = ["import re", "from json import dumps", "P = re.compile('a+')", "D = dumps"]
    code = inline(plant(tmp_path, {"_h": lines, "step": ["from _h import D, P"]}), CONFIG)
    assert "import re" in code and "from json import dumps" in code


@pytest.mark.parametrize(
    ("lines", "reason"),
    [
        (["import _h"], "plain import of a helper"),
        (["from _h import X as Y"], "aliased or star import"),
        (["from _h import *"], "aliased or star import"),
        (["from __future__ import annotations"], "from __future__"),
        (["from . import x"], "relative imports"),
        (["def f():", "    from _h import X", "    return X"], "isn't a top-level statement"),
        (
            ["try:", "    from _h import X", "except ImportError:", "    pass"],
            "isn't a top-level statement",
        ),
        (["if True:", "    from _h import X"], "isn't a top-level statement"),
    ],
)
def test_unsafe_import_forms_are_refused(tmp_path, lines, reason):
    with pytest.raises(InlineError, match=reason):
        inline(plant(tmp_path, {"_h": ["X = 1"], "step": lines}), CONFIG)


def test_a_name_bound_in_two_inlined_modules_is_refused(tmp_path):
    modules = {"_h": ["X = 1"], "_g": ["X = 2"], "step": ["from _h import X", "from _g import X"]}
    with pytest.raises(InlineError, match="bound in two inlined modules: X"):
        inline(plant(tmp_path, modules), CONFIG)


def test_a_step_name_shadowing_its_helper_is_refused(tmp_path):
    modules = {
        "_h": ["def _read():", "    return 1"],
        "step": ["from _h import _read", "def _read():", "    return 2"],
    }
    with pytest.raises(InlineError, match="_read"):
        inline(plant(tmp_path, modules), CONFIG)


def test_a_config_name_the_build_doesnt_ship_is_refused(tmp_path):
    modules = {
        "_config": ["RULES = {}", "PRIVATE = {}", "MAX = 1"],
        "step": ["from _config import MAX, RULES"],
    }
    with pytest.raises(InlineError, match="_config doesn't define MAX"):
        inline(plant(tmp_path, modules), CONFIG)


def test_an_import_cycle_is_refused(tmp_path):
    modules = {
        "_a": ["from _b import B", "A = 1"],
        "_b": ["from _a import A", "B = 2"],
        "step": ["from _a import A"],
    }
    with pytest.raises(InlineError, match="an import cycle through _a"):
        inline(plant(tmp_path, modules), CONFIG)


def test_a_name_the_helper_doesnt_define_is_refused(tmp_path):
    modules = {
        "_b": ["b = 1"],
        "_a": ["from _b import b, ghost", "A = b"],
        "step": ["from _a import A"],
    }
    with pytest.raises(InlineError, match="_b doesn't define ghost"):
        inline(plant(tmp_path, modules), CONFIG)


def test_statements_sharing_a_line_with_a_helper_import_survive(tmp_path):
    modules = {
        "_a": ["a = 2"],
        "step": [
            "from _a import a; LIMIT = 3",
            "LAST = 1; from _a import a",
            "Z = a + LIMIT + LAST",
        ],
    }
    assert run(inline(plant(tmp_path, modules), CONFIG))["Z"] == 6
