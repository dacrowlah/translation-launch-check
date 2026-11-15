"""The build inlines every underscore module into one namespace per step, so a name bound
twice at module level would silently shadow the first binding in the built step only.

Module-level names come from symtable (every binding form: assignment, def, class, loop and
with targets, walrus, match captures, except handlers, `global` in a function), run on the
source with comprehensions rewritten as generator expressions (3.12 inlines them).
Imports come from the AST, keyed by what they bind, so `import re` in two modules is one
binding.
"""

import ast
import symtable

import pytest

from builders import CODE_STEPS, a_module_file, helper_modules

CONFIG_LITERALS = ("RULES", "PRIVATE")  # the build replaces _config with these two literals
SCOPES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Lambda)


def _module_scope(node):
    """Every node outside function, class and lambda bodies."""
    for child in ast.iter_child_nodes(node):
        if not isinstance(child, SCOPES):
            yield child
            yield from _module_scope(child)


def _origin(alias, module):
    if alias.name == "*":
        raise ValueError("a star import binds names nobody can see: " + module)
    target = alias.name if alias.asname else alias.name.split(".")[0]
    return (alias.asname or target, (module, target))


def _imports(tree):
    """Module-level imports. Only imports of modules in code_steps are skipped (the inliner
    removes them); a private stdlib import such as _collections_abc is collected."""
    found = set()
    for node in _module_scope(tree):
        module = getattr(node, "module", None) or ""
        local = (CODE_STEPS / f"{module}.py").is_file() if module.startswith("_") else False
        if isinstance(node, ast.Import | ast.ImportFrom) and not local:
            found |= {_origin(alias, module) for alias in node.names}
    return found


def _declared_global(table):
    names = {
        s.get_name() for s in table.get_symbols() if s.is_declared_global() and s.is_assigned()
    }
    return names.union(*(_declared_global(child) for child in table.get_children()))


def _local_names(table):
    """Names the module assigns (def and class included). An import counts only through
    _imports, unless the module rebinds it, which then clashes with the import."""
    names = {symbol.get_name() for symbol in table.get_symbols() if symbol.is_assigned()}
    return names.union(*(_declared_global(child) for child in table.get_children()))


class _NotInlined(ast.NodeTransformer):
    """List, set and dict comprehensions rewritten as generator expressions, which keep their
    own scope as before PEP 709. symtable then neither lists their targets as module names
    nor misses a walrus inside them (3.12 does both for inlined comprehensions)."""

    def _call(self, func, elt, node):
        self.generic_visit(node)
        return ast.Call(ast.Name(func, ast.Load()), [ast.GeneratorExp(elt, node.generators)], [])

    def visit_ListComp(self, node):
        return self._call("list", node.elt, node)

    def visit_SetComp(self, node):
        return self._call("set", node.elt, node)

    def visit_DictComp(self, node):
        return self._call("dict", ast.Tuple([node.key, node.value], ast.Load()), node)


def bindings(path):
    """(name, origin) pairs bound at module level; origin is None except for imports."""
    if path.stem == "_config":
        return {(name, None) for name in CONFIG_LITERALS}
    source = path.read_text(encoding="utf-8")
    rewritten = ast.fix_missing_locations(_NotInlined().visit(ast.parse(source)))
    table = symtable.symtable(ast.unparse(rewritten), path.name, "exec")
    return _imports(ast.parse(source)) | {(name, None) for name in _local_names(table)}


def clashes(paths):
    owners = {}
    for path in paths:
        for name, origin in bindings(path):
            owners.setdefault(name, set()).add(origin or path.name)
    return sorted(name for name, found in owners.items() if len(found) > 1)


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
