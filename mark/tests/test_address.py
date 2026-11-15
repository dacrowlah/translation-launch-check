import pytest

from _address import on_allow_list, valid_address, valid_domain

ALLOW = {"addresses": ["Me@X.test"], "domains": ["Example.ORG"]}
LONG_DOMAIN = ("x" * 63 + ".") * 3 + "x" * 56 + ".org"  # 252 characters


def test_an_address_of_254_characters_is_valid():
    assert len("a@" + LONG_DOMAIN) == 254
    assert valid_address("a@" + LONG_DOMAIN) is True


def test_an_address_of_255_characters_is_not():
    assert valid_address("ab@" + LONG_DOMAIN) is False


@pytest.mark.parametrize("local", ["a" * 64, "a.b", "a+b", "a_b-c", "A1"])
def test_valid_local_parts(local):
    assert valid_address(local + "@x.test") is True


@pytest.mark.parametrize(
    "address",
    [
        "a" * 65 + "@x.test",
        "a%b@x.test",
        ".a@x.test",
        "a.@x.test",
        "a..b@x.test",
        "a@x",
        "a@x.test.",
        "a@@x.test",
        "a b@x.test",
        "\u212a@x.test",
        "",
        None,
        ["a@x.test"],
    ],
)
def test_invalid_addresses(address):
    assert valid_address(address) is False


@pytest.mark.parametrize(
    "domain",
    ["x.test", "example.org", "a-b.c.d", "xn--bcher-kva.example", "a" * 63 + ".org", "x.xn--p1ai"],
)
def test_valid_domains(domain):
    assert valid_domain(domain) is True


@pytest.mark.parametrize(
    "domain",
    [
        "test",
        ".x.test",
        "x.test.",
        "@x.test",
        "me@x.test",
        "x .test",
        "\u212ax.test",
        "ex_ample.org",
        "-.-",
        "b-.org",
        "-b.org",
        "1.2.3.4",
        "example.123",
        "example.-org",
        "a" * 64 + ".org",
        "a." * 126 + "org",  # 255 characters
        None,
    ],
)
def test_invalid_domains(domain):
    assert valid_domain(domain) is False
    assert valid_address("x@" + str(domain)) is False


def test_a_domain_of_253_characters_is_valid_and_254_is_not():
    assert len("a." * 125 + "org") == 253
    assert valid_domain("a." * 125 + "org") is True
    assert valid_domain("a." * 125 + "orgx") is False


@pytest.mark.parametrize("address", ["me@x.test", "ME@x.TEST", "any@example.org"])
def test_on_allow_list_matches_case_insensitively(address):
    assert on_allow_list(address, ALLOW) is True


@pytest.mark.parametrize("address", ["you@x.test", "a@sub.example.org", "a@example.org.x", "x"])
def test_on_allow_list_refuses_others(address):
    assert on_allow_list(address, ALLOW) is False


@pytest.mark.parametrize(
    "allow_list",
    [
        {},
        None,
        "me@x.test",
        {"addresses": None, "domains": []},
        {"addresses": ["me@x.test"]},
        {"addresses": [7, "me@x.test"], "domains": []},
        {"addresses": ["me@x.test"], "domains": "x.test"},
        {"addresses": ["me@x.test", "Owner <o@x.test>"], "domains": []},
        {"addresses": ["me@x.test"], "domains": ["-bad-"]},
    ],
)
def test_on_allow_list_fails_closed_on_a_malformed_list(allow_list):
    assert on_allow_list("me@x.test", allow_list) is False
