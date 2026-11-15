"""A localization CSV -> the package. Byte-level checks first (size before decoding, UTF-8
with or without a BOM, no NUL), then CSV syntax (the delimiter sniffed from the header
line), then the shared package rules: every problem at once. Cells are text, never
evaluated. Standard library and pure helpers only (no SDK, no private config), so
scripts/send_package.py can use it outside Mark. Nothing here raises."""

import csv
import io

from _campaign import campaign_from
from _package import validate_package
from _text_problems import file_problem, header_problem, problem, where_row

DELIMITERS = (",", ";", "\t")  # comma wins a tie
BYTE_ORDER_MARK = "\ufeff"
FIXED_COLUMNS = ("id", "channel", "field")
MIN_COLUMNS = len(FIXED_COLUMNS) + 2  # the master and at least one translation


def strip_bom(text):
    """The CSV parser's first step, for every source: one leading UTF-8 BOM removed."""
    return text[1:] if isinstance(text, str) and text.startswith(BYTE_ORDER_MARK) else text


def _decoded(raw):
    try:
        return strip_bom(raw.decode("utf-8"))
    except UnicodeDecodeError:
        return None


def _text_problem(raw, text, limit):
    if len(raw) > limit:
        return file_problem("too_large_file", limit_kb=limit // 1024)
    if text is None:
        return file_problem("not_utf8")
    return file_problem("nul") if "\x00" in text else None


def _sniff(text):
    header = text.split("\n", 1)[0]
    return max(DELIMITERS, key=header.count)


def _blank_record(record):
    return not any(cell.strip() for cell in record)


def _csv_rows(text):
    try:
        return list(csv.reader(io.StringIO(text, newline=""), delimiter=_sniff(text)))
    except csv.Error:
        return None


def _records(text):
    """Rows as lists of cells, without the trailing blank rows and columns a spreadsheet
    leaves; None if the text isn't CSV."""
    records = _csv_rows(text)
    while records and _blank_record(records[-1]):
        records.pop()
    return _without_ghost_columns(records) if records else records


def _ghost_column(records, column):
    return all(len(record) <= column or not record[column].strip() for record in records)


def _without_ghost_columns(records):
    """Trailing columns blank from the header down, which a spreadsheet leaves when its used
    range runs past the data, are dropped like trailing blank rows."""
    width = len(records[0])
    while width > 1 and _ghost_column(records, width - 1):
        width -= 1
    return [record[:width] for record in records]


def _header_problems(header):
    names = tuple(name.strip().lower() for name in header[: len(FIXED_COLUMNS)])
    ok = names == FIXED_COLUMNS and len(header) >= MIN_COLUMNS
    return [] if ok else [header_problem("bad_header")]


def _width_problem(record, number, width):
    """Only a row longer than the header: a short row's missing cells are reported as empty."""
    if len(record) <= width:
        return None
    return problem(where_row(number), "row_cells", row=number, count=len(record), width=width)


def _csv_line(record, columns):
    cells = record + [""] * (len(columns) - len(record))  # a short row's missing cells: empty
    fixed = {name: cell.strip() for name, cell in zip(FIXED_COLUMNS, cells, strict=False)}
    texts = dict(zip(columns[len(FIXED_COLUMNS) :], cells[len(FIXED_COLUMNS) :], strict=False))
    return {**fixed, "texts": texts}


def _csv_to_package(records, campaign):
    columns = [name.strip() for name in records[0]]
    locales, lines = columns[len(FIXED_COLUMNS) :], [_csv_line(row, columns) for row in records[1:]]
    return dict(campaign=campaign, master_locale=locales[0], locales=locales[1:], lines=lines)


def _width_problems(records):
    width = len(records[0])
    found = (_width_problem(record, index + 2, width) for index, record in enumerate(records[1:]))
    return [each for each in found if each]


def _parsed(records, campaign, rules):
    """(package, []) or (None, every problem). A bad header stops here: its columns can't be
    mapped to locales."""
    header = _header_problems(records[0])
    pkg = None if header else _csv_to_package(records, campaign)
    problems = header or _width_problems(records) + validate_package(pkg, rules)
    return (None, problems) if problems else (pkg, [])


def _checked_text(raw, limit):
    """(text, None) or (None, the problem). The size is checked before decoding."""
    text = _decoded(raw) if len(raw) <= limit else None
    return text, _text_problem(raw, text, limit)


def parse_csv(raw, file_name, rules):
    """(package, []) for a valid file, else (None, every problem found)."""
    text, stop = _checked_text(raw, rules["limits"]["max_file_bytes"])
    records = _records(text) if stop is None else None
    if stop or not records:
        return None, [stop or file_problem("empty_file" if records == [] else "not_csv")]
    return _parsed(records, campaign_from(file_name), rules)
