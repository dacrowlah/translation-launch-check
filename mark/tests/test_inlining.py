"""The build inlines every underscore module into one namespace per step, so a name bound
twice at module level would silently shadow the first binding in the built step only. The
walker (`_build/names.py`) is shared with the build, which refuses a clash; these tests pin
it on every binding form and on the real helpers."""

import pytest

from _build.names import bindings, clashes
from builders import a_module_file, helper_modules

FORMS = [
    "A = 1",
    "B: int = 2",
    "C, D = 3, 4",
    "A[0] = 1",
    "def f():",
    "    global G",
    "    G = 5",
    "    E = 6",
    "async def g(): ...",
    "class K: ...",
    "type T = int",
    "for F in []:",
    "    H = 1",
    "while A:",
    "    I = 2",
    "with open('x') as J: ...",
    "(L := 3)",
    "match A:",
    "    case [M]: ...",
    "try: ...",
    "except* ValueError as N: ...",
    "from _text import TEXT",
    "import json as O",
]


def test_bindings_cover_every_module_level_form(tmp_path):
    names = {name for name, _ in bindings(a_module_file(tmp_path, "_m.py", FORMS))}
    assert names == set("ABCDFGHIJKLMNOT") | {"f", "g"}


def test_a_star_import_is_refused(tmp_path):
    with pytest.raises(ValueError, match="star import"):
        bindings(a_module_file(tmp_path, "_s.py", ["from json import *"]))


def test_an_import_inside_a_function_is_not_module_level(tmp_path):
    lines = ["def f():", "    import json as P", "    return P"]
    assert bindings(a_module_file(tmp_path, "_f.py", lines)) == {("f", None)}


def test_the_same_import_in_two_modules_is_no_clash(tmp_path):
    first = a_module_file(
        tmp_path, "_a.py", ["import re", "import os.path", "from json import dumps"]
    )
    second = a_module_file(tmp_path, "_b.py", ["import re", "import os", "from json import dumps"])
    assert clashes([first, second]) == []


def test_an_import_alias_or_a_nested_binding_clashes(tmp_path):
    first = a_module_file(tmp_path, "_a.py", ["import json as TEXT", "from re import compile as X"])
    second = a_module_file(tmp_path, "_b.py", ["TEXT = {}", "for _ in []:", "    X = 1"])
    third = a_module_file(tmp_path, "_c.py", ["def h():", "    global X", "    X = 2"])
    assert clashes([first, second, third]) == ["TEXT", "X"]


def test_a_comprehension_variable_is_not_module_level(tmp_path):
    first = a_module_file(
        tmp_path, "_a.py", ["A = [i for i in range(3)]", "B = {k: v for k, v in []}"]
    )
    second = a_module_file(tmp_path, "_b.py", ["C = {i for i in range(3)}", "D = [k for k in []]"])
    assert clashes([first, second]) == []


def test_a_name_also_bound_outside_a_comprehension_still_clashes(tmp_path):
    first = a_module_file(tmp_path, "_a.py", ["A = [i for i in range(3)]", "i = 0"])
    second = a_module_file(
        tmp_path, "_b.py", ["B = [k for k in range(3)]", "C = [(k := j) for j in []]"]
    )
    third = a_module_file(tmp_path, "_c.py", ["i = 1", "k = 2"])
    assert clashes([first, second, third]) == ["i", "k"]


OTHER = ["f = 1", "K = 1", "e = 1", "m = 1", "g = 1", "q = 1", "r = 1", "s = 1", "rest = 1"]


@pytest.mark.parametrize(
    ("lines", "expected"),
    [
        (["X = [f for f in range(3)]", "def f(): ..."], ["f"]),
        (["Y = [K for K in range(3)]", "class K: ..."], ["K"]),
        (
            [
                "Z = [e for e in range(3)]",
                "try:",
                "    pass",
                "except ValueError as e:",
                "    pass",
            ],
            ["e"],
        ),
        (["W = [m for m in range(3)]", "match 1:", "    case m: pass"], ["m"]),
        (["V = [g for g in range(3)]", "def h():", "    global g", "    g = 1"], ["g"]),
        (["def d(x=[q for q in range(3)]): ..."], []),
        (["def e2(x=[(r := 1) for _ in 'a']): ..."], ["r"]),
        (["X = {f: 1 for f in range(3)}", "async def f(): ..."], ["f"]),
        (["X = {K for K in range(3)}", "if X:", "    class K: ..."], ["K"]),
        (["X = [s for s in range(3)]", "match []:", "    case [*s]: pass"], ["s"]),
        (["X = [rest for rest in range(3)]", "match {}:", "    case {**rest}: pass"], ["rest"]),
        (["X = [g for g in range(3)]", "async def h():", "    global g", "    g = 1"], ["g"]),
        (["X = {q for q in range(3)}", "Y = {e: 1 for e in range(3)}"], []),
        (["X = {(r := 1) for _ in 'a'}", "Y = {(m := 1): 1 for _ in 'a'}"], ["m", "r"]),
        (["X = [x for x in [q for q in 'ab']]"], []),  # the first iterable runs in module scope
    ],
)
def test_comprehension_names_never_hide_or_invent_a_binding(tmp_path, lines, expected):
    first, second = a_module_file(tmp_path, "_a.py", lines), a_module_file(tmp_path, "_b.py", OTHER)
    assert clashes([first, second]) == expected


def test_a_private_stdlib_import_is_collected(tmp_path):
    first = a_module_file(tmp_path, "_a.py", ["from _collections_abc import Mapping as TEXT"])
    second = a_module_file(tmp_path, "_b.py", ["TEXT = {}"])
    assert clashes([first, second]) == ["TEXT"]


def test_a_rebound_import_clashes_with_the_import(tmp_path):
    assert clashes([a_module_file(tmp_path, "_r.py", ["import os", "os = 2"])]) == ["os"]


def test_inlined_modules_bind_each_top_level_name_once():
    paths = helper_modules()
    names = {name for path in paths for name, _ in bindings(path)}
    assert {"call_tool", "write_run_file", "send_email", "valid_address", "RULES"} <= names
    assert clashes(paths) == []
