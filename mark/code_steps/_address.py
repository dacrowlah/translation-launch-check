"""Email address and allow-list rules: one source for _config (checked at import) and
_platform (checked before every email). Nothing here raises.

Addresses are bare ASCII, checked on the original text before lower(), never with re.I:
with it, [a-z] also matches U+212A (Kelvin) and U+017F, which lower() turns into ASCII.
"""

import re

ATOM = r"[A-Za-z0-9_+-]+"  # no "%" (old relay routing); dots only between atoms
LABEL = r"[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?"  # a hostname label: <= 63, no edge "-"
TLD = r"[A-Za-z]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?"  # letter first: never all digits (xn-- ok)
HOST = rf"({LABEL}\.)+{TLD}"
DOMAIN = re.compile(HOST)
ADDRESS = re.compile(rf"(?P<local>{ATOM}(\.{ATOM})*)@{HOST}")
MAX_LOCAL = 64
MAX_DOMAIN = 253
MAX_ADDRESS = 254  # both lengths are checked before a regex runs, so matching stays bounded


def valid_domain(text):
    """A bare hostname of two or more labels, as written in an allow-list."""
    ok = isinstance(text, str) and len(text) <= MAX_DOMAIN
    return ok and DOMAIN.fullmatch(text) is not None


def valid_address(text):
    """One bare address: dot-separated atoms, local part <= 64, whole <= 254 characters."""
    if not (isinstance(text, str) and len(text) <= MAX_ADDRESS):
        return False
    found = ADDRESS.fullmatch(text)
    return found is not None and len(found["local"]) <= MAX_LOCAL


def _all(check, values):
    return isinstance(values, list) and all(check(value) for value in values)


def valid_allow_list(allow_list):
    """A dict with a list of valid addresses under "addresses" and a list of bare domains
    under "domains". A string in place of a list would make `in` a substring test, and a
    malformed entry would silently never match."""
    if not isinstance(allow_list, dict):
        return False
    addresses, domains = allow_list.get("addresses"), allow_list.get("domains")
    return _all(valid_address, addresses) and _all(valid_domain, domains)


def _lowered(values):
    return {value.lower() for value in values}


def on_allow_list(address, allow_list):
    """A valid address that is listed exactly, or whose domain is exactly a listed domain
    (no subdomain, no suffix match). False for a malformed allow-list (valid_allow_list)."""
    if not (valid_address(address) and valid_allow_list(allow_list)):
        return False
    lowered = address.lower()
    domain = lowered.rsplit("@", 1)[1]
    return lowered in _lowered(allow_list["addresses"]) or domain in _lowered(allow_list["domains"])
