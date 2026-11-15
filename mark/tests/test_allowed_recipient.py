import pytest

from _config import PRIVATE
from _platform import allowed_recipient
from builders import EXAMPLE_ALLOWED, EXAMPLE_DOMAIN

ADDRESS, DOMAIN = EXAMPLE_ALLOWED, EXAMPLE_DOMAIN  # the example file's allow_list
LOCAL, LISTED_HOST = ADDRESS.split("@")  # owner, example.com


@pytest.mark.parametrize(
    "address",
    [
        ADDRESS,
        ADDRESS.upper(),
        f"a.b@{DOMAIN}",
        f"x+y@{DOMAIN.upper()}",
        f"a_b-c@{DOMAIN}",
        "a" * 64 + f"@{DOMAIN}",
    ],
)
def test_accepts_a_listed_address_or_a_listed_domain(address):
    assert allowed_recipient(address) is True


@pytest.mark.parametrize(
    "address",
    [
        "attacker@evil.test",
        f"other@{LISTED_HOST}",
        f"{ADDRESS}, attacker@evil.test",
        f"{ADDRESS};attacker@evil.test",
        f"attacker@evil.test,x@{DOMAIN}",
        f"attacker@evil.test x@{DOMAIN}",
        f"a b@{DOMAIN}",
        f" {ADDRESS}",
        f"{ADDRESS}\n",
        f"{ADDRESS}\r\nBcc: attacker@evil.test",
        f"{LOCAL} <{ADDRESS}>",
        f"\u212a@{DOMAIN}",  # lower() makes it k@...; re.I would match it too
        f"\u017f@{DOMAIN}",
        f"\u0430@{DOMAIN}",
        f"{ADDRESS}.",
        f"attacker%evil.test@{DOMAIN}",
        f".x@{DOMAIN}",
        f"x.@{DOMAIN}",
        f"a..b@{DOMAIN}",
        "a" * 65 + f"@{DOMAIN}",
        "a" * 100_000 + f"@{DOMAIN}",
        f"x@sub.{DOMAIN}",
        f"x@evil-{DOMAIN}",
        f"x@{DOMAIN}.evil.test",
        "",
        [ADDRESS],
        None,
    ],
)
def test_refuses_everything_else(address):
    assert allowed_recipient(address) is False


def test_the_example_qa_inbox_is_allowed():
    assert allowed_recipient(PRIVATE["qa_inbox"]) is True
