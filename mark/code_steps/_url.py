"""The template URL rule, applied by _config at import. Nothing here raises.

https, a host that passes the shared hostname rule (valid_domain, so no port and no
userinfo), and an optional path of letters, digits, `. _ ~ ! $ & + , ; = : / ? # -` and %XX
escapes. So no spaces, quotes, "@", "<" ">", brackets, braces, backticks, "|" or "*", but
the path may hold "&", "_", "~", "!" and "#". The URL is echoed into messages as an explicit
Markdown link, and may not end in a character a Markdown autolinker drops (TRAILING).
"""

import re

from _address import valid_domain

URL_PATH = r"([A-Za-z0-9._~!$&+,;=:/?#-]|%[0-9A-Fa-f]{2})*"  # "%" only as %XX (linear)
HTTPS_URL = re.compile(rf"https://(?P<host>[^/]*)(/{URL_PATH})?")
# A Markdown autolinker (GFM) drops these from a URL's end, so the link would lose them.
TRAILING = (".", ",", ";", ":", "!", "?", "_", "~")
MAX_URL = 2_000  # checked before the regex


def valid_template_url(url):
    plain = isinstance(url, str) and len(url) <= MAX_URL and not url.endswith(TRAILING)
    found = HTTPS_URL.fullmatch(url) if plain else None
    return found is not None and valid_domain(found["host"])
