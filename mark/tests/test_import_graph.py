"""The helpers' dependency rule: each code_steps/_*.py imports only allowed standard-library
modules, opal_tms_sdk and the other helper modules beside it; it imports nothing
dynamically; and the helper imports form no cycle (the build inlines them, each once,
before the step that uses them)."""

import ast
import sys

import pytest

from builders import CODE_STEPS, a_module_file, helper_modules

PLATFORM_PACKAGES = frozenset({"opal_tms_sdk"})  # preinstalled in Mark's Python runtime
# An allow-list, not a deny-list: helpers do plain computation, and each new standard-library
# module is a reviewed one-line addition. os is build-time only: _config reads files in dev,
# and the build replaces _config with literals, so os never reaches a step. csv and io parse
# the attached file in memory (csv.reader over io.StringIO); neither opens a file or a socket.
# datetime: the report step's clock (the run time in the canvas name).
ALLOWED_STDLIB = frozenset(
    {"csv", "datetime", "hashlib", "io", "json", "pathlib", "re", "secrets", "unicodedata"}
)
BUILD_TIME_ONLY = {"_config": frozenset({"os"})}
# Builtins that import or run code the import graph can't see, flagged wherever they are
# referenced (called, aliased or passed), plus attribute access to them (builtins.exec,
# __builtins__.__import__). compile is a name only, so re.compile passes. This guards our own
# reviewed code against honest mistakes; it is not a sandbox.
DYNAMIC_NAMES = frozenset(
    {"__import__", "exec", "eval", "compile", "breakpoint", "import_module", "__builtins__"}
)
# As attributes: not compile, so re.compile passes; __builtins__ is only ever a name.
DYNAMIC_ATTRIBUTES = DYNAMIC_NAMES - {"compile", "__builtins__"}
DYNAMIC_MODULES = frozenset({"importlib", "imp", "runpy", "pkgutil", "builtins"})


def _nodes(path):
    return ast.walk(ast.parse(path.read_text(encoding="utf-8")))


def _module_names(node):
    """Top-level modules an import names. A relative import gives "" (helpers are flat
    files, so it can never be right)."""
    if isinstance(node, ast.Import):
        return {alias.name.split(".")[0] for alias in node.names}
    return {"" if node.level else node.module.split(".")[0]}


def imported_modules(path):
    """The top-level module of every import in the file, at any depth."""
    imports = (node for node in _nodes(path) if isinstance(node, ast.Import | ast.ImportFrom))
    return set().union(*(_module_names(node) for node in imports))


def foreign(path, helpers):
    """Imports that are neither an allowed standard-library module (plus that module's
    build-time extras), a platform package nor a helper."""
    allowed = ALLOWED_STDLIB | BUILD_TIME_ONLY.get(path.stem, frozenset())
    return sorted(imported_modules(path) - (allowed | PLATFORM_PACKAGES | helpers))


def _dynamic(node):
    if isinstance(node, ast.Import | ast.ImportFrom):
        return _module_names(node) & DYNAMIC_MODULES
    if isinstance(node, ast.Name):
        return {node.id} & DYNAMIC_NAMES
    return {node.attr} & DYNAMIC_ATTRIBUTES if isinstance(node, ast.Attribute) else set()


def dynamic_imports(path):
    """Dynamic imports and code execution the import graph can't see."""
    return sorted(set().union(*(_dynamic(node) for node in _nodes(path))))


def graph(paths):
    helpers = {path.stem for path in paths}
    return {path.stem: imported_modules(path) & helpers for path in paths}


def _visit(edges, state, node, trail):
    if state.get(node) == "open":
        return [*trail[trail.index(node) :], node]
    if state.get(node) == "done":
        return []
    state[node] = "open"
    nexts = (_visit(edges, state, after, [*trail, node]) for after in sorted(edges.get(node, ())))
    found = next(filter(None, nexts), [])
    state[node] = "done"
    return found


def cycle(edges):
    """One cycle as a list of names that starts and ends with the same name, or []."""
    state = {}
    starts = (_visit(edges, state, node, []) for node in sorted(edges))
    return next(filter(None, starts), [])


def test_imported_modules_reads_every_import_form(tmp_path):
    lines = ["import os.path", "from json import dumps", "from _text import TEXT"]
    lines += ["def f():", "    import re", "from . import sibling"]
    assert imported_modules(a_module_file(tmp_path, "_m.py", lines)) == {
        "os",
        "json",
        "_text",
        "re",
        "",
    }


def test_foreign_flags_third_party_and_relative_imports(tmp_path):
    lines = ["import requests", "from . import x", "import json", "from opal_tms_sdk import tools"]
    path = a_module_file(tmp_path, "_m.py", [*lines, "from _text import TEXT", "import _thread"])
    assert foreign(path, {"_text"}) == ["", "_thread", "requests"]


def test_foreign_flags_a_standard_library_module_outside_the_allow_list(tmp_path):
    lines = ["import socket", "from urllib.request import urlopen", "import json", "import ctypes"]
    lines += ["import asyncio", "from concurrent import futures", "import pdb", "import hashlib"]
    found = foreign(a_module_file(tmp_path, "_m.py", lines), set())
    assert found == ["asyncio", "concurrent", "ctypes", "pdb", "socket", "urllib"]


def test_os_is_allowed_only_in_config(tmp_path):
    assert foreign(a_module_file(tmp_path, "_m.py", ["import os"]), set()) == ["os"]
    assert foreign(a_module_file(tmp_path, "_config.py", ["import os"]), set()) == []


def test_every_allowed_name_is_a_standard_library_module():
    extras = set().union(*BUILD_TIME_ONLY.values())
    assert (ALLOWED_STDLIB | extras) <= set(sys.stdlib_module_names)


@pytest.mark.parametrize(
    ("lines", "expected"),
    [
        (
            ["import importlib", "R = importlib.import_module('requests')"],
            ["import_module", "importlib"],
        ),
        (["from importlib import import_module as im", "R = im('x')"], ["importlib"]),
        (["from x import import_module", "R = import_module('y')"], ["import_module"]),
        (["R = __import__('requests')"], ["__import__"]),
        (["exec('import requests')"], ["exec"]),
        (["R = eval('1')", "C = compile('1', 'f', 'eval')"], ["compile", "eval"]),
        (["import runpy, pkgutil", "import imp"], ["imp", "pkgutil", "runpy"]),
        (["import re", "P = re.compile('x')", "import json", "X = json.loads('1')"], []),
        (["import builtins", "L = getattr(builtins, '__import__')"], ["builtins"]),
        (["from builtins import __import__ as load"], ["builtins"]),
        (["import builtins", "builtins.exec('1')"], ["builtins", "exec"]),
        (["run = exec", "run('1')"], ["exec"]),
        (["f, g = __import__, 1"], ["__import__"]),
        (
            ["L = __builtins__.__import__", "M = __builtins__['eval']"],
            ["__builtins__", "__import__"],
        ),
        (["breakpoint()"], ["breakpoint"]),
        (["X.breakpoint()"], ["breakpoint"]),
        (["E = X.eval", "I = Y.import_module"], ["eval", "import_module"]),
    ],
)
def test_dynamic_imports_are_found(tmp_path, lines, expected):
    assert dynamic_imports(a_module_file(tmp_path, "_m.py", lines)) == expected


def test_cycle_finds_a_cycle_or_none():
    assert cycle({"a": {"b"}, "b": {"c"}, "c": {"a"}}) == ["a", "b", "c", "a"]
    assert cycle({"a": {"a"}}) == ["a", "a"]
    assert cycle({"a": {"b"}, "b": set(), "c": {"a", "b"}}) == []


def test_helpers_import_only_the_standard_library_the_sdk_and_each_other():
    paths = helper_modules()
    helpers = {path.stem for path in paths}
    assert {"_shared", "_platform", "_address", "_url", "_config"} <= helpers
    found = {path.stem: foreign(path, helpers) for path in paths}
    assert {stem: names for stem, names in found.items() if names} == {}


def test_helpers_import_nothing_dynamically():
    found = {path.stem: dynamic_imports(path) for path in helper_modules()}
    assert {stem: names for stem, names in found.items() if names} == {}


def test_helper_imports_form_no_cycle():
    edges = graph(helper_modules())
    assert {"_shared", "_address"} <= edges["_platform"]
    assert cycle(edges) == []


def step_modules():
    """The step files (every code_steps/*.py not starting with "_"): the build inlines their
    helpers into them, so they keep to the same imports."""
    return sorted(path for path in CODE_STEPS.glob("*.py") if not path.name.startswith("_"))


def test_steps_import_only_the_standard_library_the_sdk_and_helpers():
    helpers = {path.stem for path in helper_modules()}
    found = {path.stem: foreign(path, helpers) for path in step_modules()}
    assert len(found) == 5 and {stem: names for stem, names in found.items() if names} == {}


def test_steps_import_nothing_dynamically():
    found = {path.stem: dynamic_imports(path) for path in step_modules()}
    assert {stem: names for stem, names in found.items() if names} == {}
