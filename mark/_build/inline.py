"""One code step as one file Mark can run: the step's source with every helper module it
uses (transitively, each once, dependencies first) placed above it, and `_config` replaced
by literal RULES and PRIVATE. Mark runs a step as a single file, so local imports must go.

Refused, so the built step can't differ from the tested sources:
- `import _x` (a plain import of a helper: its names would be reached as attributes);
- `from _x import a as b` (an alias would bind a name the helper never defines);
- a helper import that isn't a top-level statement (inside a function, class, `try` or `if`),
  a star or relative import, `from __future__`, an import cycle;
- `from _x import y` where `_x` doesn't bind `y` (for `_config`, anything but RULES and
  PRIVATE, the two literals the build ships);
- a module-level name bound in two of the inlined modules (it would shadow the first).
"""

import ast

from _build.names import bindings, clashes, is_local
from _build.shrink import shrink

CONFIG = "_config"
HEADER = "# Built by mark/build.py from mark/code_steps/{name}. Do not edit."


class InlineError(ValueError):
    """The step or a helper can't be inlined safely."""


def _refuse_names(node):
    if any(alias.asname or alias.name == "*" for alias in node.names):
        raise InlineError("aliased or star import of a helper: " + node.module)


def _refuse_unbound(node, folder):
    """Every imported name must be bound in the helper itself (for _config: RULES and
    PRIVATE, all the build ships), or the built step would raise a NameError."""
    bound = {name for name, _ in bindings(folder / f"{node.module}.py", folder)}
    missing = [alias.name for alias in node.names if alias.name not in bound]
    if missing:
        raise InlineError(f"{node.module} doesn't define {', '.join(missing)}")


def _refuse_from(node, folder):
    if node.module == "__future__" or node.level:
        raise InlineError("from __future__ and relative imports can't be inlined")
    if is_local(node.module, folder):
        _refuse_names(node)


def _refuse(node, folder):
    if isinstance(node, ast.ImportFrom):
        _refuse_from(node, folder)
    elif isinstance(node, ast.Import) and any(is_local(a.name, folder) for a in node.names):
        raise InlineError("plain import of a helper; use from _x import name")


def _helper_imports(tree, folder):
    """The `from _x import ...` statements at the top level of the module, after refusing
    every unsafe import form anywhere in it."""
    for node in ast.walk(tree):
        _refuse(node, folder)
    nodes = [n for n in tree.body if isinstance(n, ast.ImportFrom)]
    return [n for n in nodes if is_local(n.module, folder)]


def _nested_helper_import(tree, folder):
    top = {id(node) for node in _helper_imports(tree, folder)}
    found = (n for n in ast.walk(tree) if isinstance(n, ast.ImportFrom) and id(n) not in top)
    return any(is_local(node.module, folder) for node in found)


def _parsed(path):
    tree = ast.parse(path.read_text(encoding="utf-8"))
    if _nested_helper_import(tree, path.parent):
        raise InlineError("a helper import that isn't a top-level statement: " + path.name)
    return tree


def _checked_imports(path):
    nodes = _helper_imports(_parsed(path), path.parent)
    for node in nodes:
        _refuse_unbound(node, path.parent)
    return nodes


def _dependencies(path):
    """The helpers a module imports, in order, each name checked. _config is replaced, so
    it has none."""
    if path.stem == CONFIG:
        return []
    return list(dict.fromkeys(node.module for node in _checked_imports(path)))


def _visit_one(folder, name, seen, order):
    seen[name] = "open"
    _visit(folder / f"{name}.py", seen, order)
    seen[name] = "done"
    order.append(name)  # after its own dependencies


def _visit_next(folder, name, seen, order):
    if seen.get(name) == "open":
        raise InlineError("an import cycle through " + name)
    if name not in seen:
        _visit_one(folder, name, seen, order)


def _visit(path, seen, order):
    for name in _dependencies(path):
        _visit_next(path.parent, name, seen, order)
    return order


def helper_order(step_path):
    """Every helper the step uses, transitively, each once, dependencies first."""
    return _visit(step_path, {}, [])


def _stripped(path):
    """The module without its helper imports: the statements dropped from its tree, so a
    multi-line import, `; X = 1` on the same line or a form feed can't misalign anything."""
    tree = _parsed(path)
    imports = {id(node) for node in _helper_imports(tree, path.parent)}
    tree.body = [node for node in tree.body if id(node) not in imports] or [ast.Pass()]
    return ast.unparse(tree)


def _literals(config):
    """_config as the build ships it: two literal assignments, ASCII-escaped."""
    return f"RULES = {ascii(config['RULES'])}\nPRIVATE = {ascii(config['PRIVATE'])}"


def _section(path, config):
    body = _literals(config) if path.stem == CONFIG else _stripped(path)
    return f"# ---- {path.name} ----\n{body}\n"


def _refuse_clashes(paths, folder):
    clash = clashes(paths, folder)
    if clash:
        raise InlineError("a name is bound in two inlined modules: " + ", ".join(clash))


def inline(step_path, config):
    """The built step: a header line, then each helper in dependency order and the step
    itself, shrunk (shrink). config holds the literal RULES and PRIVATE."""
    paths = [step_path.parent / f"{name}.py" for name in helper_order(step_path)]
    _refuse_clashes([*paths, step_path], step_path.parent)
    sections = [_section(path, config) for path in [*paths, step_path]]
    return HEADER.format(name=step_path.name) + "\n" + shrink("\n\n".join(sections)) + "\n"
