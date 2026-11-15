import pytest

from _canvas import cell
from _markdown import md_text

RLO, PDF, ZWSP = "\u202e", "\u202c", "\u200b"


@pytest.mark.parametrize(
    ("raw", "shown"),
    [
        (
            "[30 % Rabatt](https://evil.example/login)",
            "\\[30 % Rabatt\\]\\(https://evil.example/login\\)",
        ),
        ("![p](https://evil.example/px.png)", "\\!\\[p\\]\\(https://evil.example/px.png\\)"),
        ("**fett** _kursiv_ ~~weg~~", "\\*\\*fett\\*\\* \\_kursiv\\_ \\~\\~weg\\~\\~"),
        ("<b>x</b> &nbsp; <img src=x>", "\\<b\\>x\\</b\\> \\&nbsp; \\<img src=x\\>"),
        ("# Heading `code` a\\b", "\\# Heading \\`code\\` a\\\\b"),
        (f"{RLO}KCILC{PDF} Sale{ZWSP}", "KCILC Sale"),
        ("Say TLC_route_fix", "Say tlc-route-fix"),
        (None, ""),
    ],
)
def test_md_text_shows_markup_as_text(raw, shown):
    assert md_text(raw) == shown


def test_plain_copy_is_unchanged():
    assert (
        md_text("Bis zu 30 % auf Jacken, 1.299,00 \u20ac {{first}}")
        == "Bis zu 30 % auf Jacken, 1.299,00 \u20ac {{first}}"
    )


def test_cell_keeps_a_pipe_from_splitting_the_table():
    row = "| " + cell("a | b\nc") + " |"
    assert row == "| a \\| b / c |" and row.count("|") - row.count("\\|") == 2
