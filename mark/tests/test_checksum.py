import pytest

from _checksum import (
    canonical_bytes,
    canonical_json,
    facts_checksum,
    json_size,
    locale_checksum,
    sha256_hex,
)
from builders import LOCALE_CHECKSUM, LOCALE_LINES, a_nested_list

# The skills' sender fixture: a webhook package (every field except package_sha256).
FIXTURE = {
    "campaign": "Example",
    "master_locale": "en-US",
    "locales": ["de-DE"],
    "lines": [
        {
            "id": "L1",
            "channel": "email",
            "field": "body",
            "texts": {
                "en-US": "Save 20% <b>now</b> & more\nDetails",
                "de-DE": "Jetzt 20 % sparen <b>jetzt</b> & mehr\u2028Gr\u00fc\u00dfe",
            },
        }
    ],
}
FIXTURE_CANONICAL = (
    '{"campaign":"Example","lines":[{"channel":"email","field":"body","id":"L1","texts":'
    '{"de-DE":"Jetzt 20 % sparen <b>jetzt</b> & mehr\u2028Gr\u00fc\u00dfe",'
    '"en-US":"Save 20% <b>now</b> & more\\nDetails"}}],"locales":["de-DE"],'
    '"master_locale":"en-US"}'
)
FIXTURE_SHA256 = "0e294581c65d6bfe06b3f223cfe5555f3d48335660934173779c10a804cb6f75"


def test_canonical_bytes_reproduce_the_sender_fixture():
    blob = canonical_bytes(FIXTURE)
    assert blob == FIXTURE_CANONICAL.encode("utf-8")
    assert len(blob) == 235


def test_sha256_hex_reproduces_the_fixture_checksum():
    assert sha256_hex(FIXTURE) == FIXTURE_SHA256


def test_facts_checksum_is_the_first_16_hex():
    assert facts_checksum(FIXTURE) == "0e294581c65d6bfe"


def test_canonical_json_is_the_same_text():
    assert canonical_json(FIXTURE) == FIXTURE_CANONICAL


def test_facts_checksum_ignores_key_order():
    assert facts_checksum({"a": 1, "b": [1]}) == facts_checksum({"b": [1], "a": 1})


def test_facts_checksum_keeps_its_pinned_value():
    assert facts_checksum({"t": "\u00e9"}) == "5a4e86c58f34a06c"


def test_facts_checksum_does_not_normalize_text():
    assert facts_checksum({"t": "e\u0301"}) == "82acf8eef379c4d8"


def test_facts_checksum_keeps_a_float_a_float():
    assert facts_checksum({"a": 1.0}) == "c29a44abc114a1d7"
    assert facts_checksum({"a": 1}) == "015abd7f5cc57a2d"


@pytest.mark.parametrize(
    "value",
    [
        {1: "a", "b": 2},
        {1: "a"},
        {True: "a"},
        {"t": "\ud800"},
        {"a": float("nan")},
        {"a": float("inf")},
        {"a": (1, 2)},
        {"a": {1, 2}},
        {"a": object()},
        a_nested_list(100_000),
    ],
)
def test_data_that_is_not_plain_json_has_no_checksum(value):
    assert canonical_bytes(value) is None
    assert canonical_json(value) is None
    assert facts_checksum(value) is None
    assert sha256_hex(value) is None


def test_null_has_a_checksum():
    assert facts_checksum(None) == "74234e98afe7498f"


def test_locale_checksum_covers_the_locale_code():
    assert locale_checksum("de-DE", LOCALE_LINES, []) == LOCALE_CHECKSUM  # d105065e1368987a
    assert locale_checksum("de-CH", LOCALE_LINES, []) == "042fab3eb2907552"


def test_locale_checksum_is_none_for_unencodable_lines():
    assert locale_checksum("de-DE", [{"text": "\udfff"}], []) is None


class _RaisingEq(dict):
    def __eq__(self, other):
        raise TypeError("eq")

    __hash__ = None


class _RaisingKey(str):
    def __lt__(self, other):
        raise ZeroDivisionError("lt")


@pytest.mark.parametrize("value", [_RaisingEq(a=1), {_RaisingKey("a"): 1, _RaisingKey("b"): 2}])
def test_canonical_bytes_never_raises(value):
    assert canonical_bytes(value) is None
    assert facts_checksum(value) is None


@pytest.mark.parametrize(
    ("value", "size"),
    [
        ({"x": "a"}, 10),  # {"x": "a"}
        ({"x": "\u00fc"}, 15),  # \u00fc is 6 bytes escaped, 2 in UTF-8
        ({"x": "\u6625"}, 15),
        ({"x": "\U0001f600"}, 21),  # a surrogate pair: 12 bytes
        ({"b": 1, "a": [1, 2]}, 21),  # {"a": [1, 2], "b": 1}
        ([], 2),
    ],
)
def test_json_size_is_the_escaped_size_with_default_separators(value, size):
    assert json_size(value) == size


@pytest.mark.parametrize("value", [{"a": float("nan")}, {1: "a"}, {"t": "\ud800"}, {"a": (1,)}])
def test_json_size_is_none_for_data_that_is_not_plain_json(value):
    assert json_size(value) is None
