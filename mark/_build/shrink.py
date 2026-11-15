"""The built step, smaller: Mark counts a code step's code toward its event cap, so the
inliner's output loses its docstrings, comments and blank lines, indents by one space and
escapes non-ASCII, without changing the program (the parsed trees must be equal)."""

import ast


class ShrinkError(ValueError):
    """Shrinking would change the program."""


def _is_text(statement):
    """A bare string statement: a docstring, or a helper's module docstring mid-file."""
    value = statement.value if isinstance(statement, ast.Expr) else None
    return isinstance(value, ast.Constant) and isinstance(value.value, str)


def _without_text(tree):
    for node in ast.walk(tree):
        if hasattr(node, "body") and isinstance(node.body, list):
            node.body = [s for s in node.body if not _is_text(s)] or [ast.Pass()]
    return tree


def _one_space(code):
    """ast.unparse indents by four spaces and writes every statement on one line, strings
    escaped, so each indent can shrink to one space and blank lines can go."""
    lines = [line for line in code.splitlines() if line.strip()]
    return "\n".join(
        " " * ((len(line) - len(line.lstrip(" "))) // 4) + line.lstrip(" ") for line in lines
    )


def _escaped(char):
    if ord(char) < 128:
        return char
    return f"\\u{ord(char):04x}" if ord(char) < 0x10000 else f"\\U{ord(char):08x}"


def _ascii(code):
    """ast.unparse writes printable non-ASCII characters into string literals as they are;
    our code has non-ASCII only inside (non-raw, after unparse) string literals, so each one
    can become its escape. The tree comparison in shrink() confirms it."""
    return "".join(_escaped(char) for char in code)


def shrink(code):
    """The same program, smaller and ASCII: docstrings, comments and blank lines gone,
    one-space indents, non-ASCII escaped. Refused unless it parses to exactly the same tree
    (minus the bare strings)."""
    small = _ascii(_one_space(ast.unparse(_without_text(ast.parse(code)))))
    if ast.dump(ast.parse(small)) != ast.dump(_without_text(ast.parse(code))):
        raise ShrinkError("shrinking changed the program")
    return small
