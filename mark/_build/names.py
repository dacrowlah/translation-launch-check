"""Module-level names, for the inliner: the build puts every helper a step uses into the
step's one file, so a name bound in two of those modules would silently shadow the first
binding. The build refuses that, and the tests run the same check on the sources.

Names come from symtable (every binding form: assignment, def, class, loop and with
targets, walrus, match captures, except handlers, `global` in a function), run on the source
with comprehensions rewritten as generator expressions (3.12 inlines them). Imports come
from the AST, keyed by what they bind, so `import re` in two modules is one binding.
"""

import ast
import symtable
from pathlib import Path

CODE_STEPS = Path(__file__).resolve().parents[1] / "code_steps"
CONFIG_LITERALS = ("RULES", "PRIVATE")  # the build replaces _config with these two literals
SCOPES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Lambda)


def module_scope(node):
    """Every node outside function, class and lambda bodies."""
    for child in ast.iter_child_nodes(node):
        if not isinstance(child, SCOPES):
            yield child
            yield from module_scope(child)


def is_local(module, folder):
    """A helper module beside the step: the inliner removes its import."""
    return bool(module) and module.startswith("_") and (folder / f"{module}.py").is_file()


def _origin(alias, module):
    if alias.name == "*":
        raise ValueError("a star import binds names nobody can see: " + module)
    target = alias.name if alias.asname else alias.name.split(".")[0]
    return (alias.asname or target, (module, target))


def _import_bindings(node, folder):
    module = getattr(node, "module", None) or ""
    if not isinstance(node, ast.Import | ast.ImportFrom) or is_local(module, folder):
        return set()
    return {_origin(alias, module) for alias in node.names}


def _imports(tree, folder):
    """Module-level imports. Only imports of helper modules are skipped (the inliner
    removes them); a private stdlib import such as _collections_abc is collected."""
    return set().union(*(_import_bindings(node, folder) for node in module_scope(tree)))


def _declared_global(table):
    symbols = table.get_symbols()
    names = {s.get_name() for s in symbols if s.is_declared_global() and s.is_assigned()}
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


def _table(source, name):
    rewritten = ast.fix_missing_locations(_NotInlined().visit(ast.parse(source)))
    return symtable.symtable(ast.unparse(rewritten), name, "exec")


def bindings(path, folder=CODE_STEPS):
    """(name, origin) pairs bound at module level; origin is None except for imports."""
    if path.stem == "_config":
        return {(name, None) for name in CONFIG_LITERALS}
    source = path.read_text(encoding="utf-8")
    assigned = {(name, None) for name in _local_names(_table(source, path.name))}
    return _imports(ast.parse(source), folder) | assigned


def clashes(paths, folder=CODE_STEPS):
    """Names bound in more than one of paths (an import of one origin counts once)."""
    owners = {}
    for path in paths:
        for name, origin in bindings(path, folder):
            owners.setdefault(name, set()).add(origin or path.name)
    return sorted(name for name, found in owners.items() if len(found) > 1)
