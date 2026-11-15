"""template_url: https, a host that passes the shared hostname rule, and a plain path. The
URL is echoed into messages and the canvas. test_config pins that _config applies it."""

import pytest

from _url import valid_template_url


@pytest.mark.parametrize(
    "url",
    [
        "https://x.test",
        "https://x.test/",
        "https://x.test/template.csv?x=1&y=2#top",
        "https://xn--p1ai.xn--p1ai/t",
        "https://x.test/a_b-c~d%20e.csv",
        "https://x.test/a%7eb%7E.csv",
        "https://x.test/a.b/c",
        "https://x.test/" + "a" * 1_984,  # 2,000 characters
    ],
)
def test_a_plain_https_url_is_accepted(url):
    assert valid_template_url(url) is True


@pytest.mark.parametrize(
    "url",
    [
        None,
        5,
        "not a url",
        "http://x.test/template.csv",
        "https://x.test/a b.csv",
        "https://ex\u00e4mple.com/t.csv",
        "https://x.test/t\u00a0.csv",
        "https://user@x.test/t.csv",
        "https://x.test/t.csv)[x](https://evil.test",
        "https://x.test/<b>.csv",
        'https://x.test/"t".csv',
        "https://x.test/'t'.csv",
        "https://x.test/`t`.csv",
        "https://x.test/t\\.csv",
        "https://x.test/a|b.csv",
        "https://x.test/{count}.csv",
        "https://x.test/*bold*.csv",
    ],
)
def test_a_url_with_a_character_outside_the_plain_set_is_refused(url):
    assert valid_template_url(url) is False


@pytest.mark.parametrize(
    "url",
    [
        "https://",
        "https://.",
        "https://-",
        "https:///etc/passwd",
        "https://x/t.csv",
        "https://1.2.3.4/t.csv",
        "https://x.test:443/t.csv",
        "https://|x.test",
        "https://" + "a" * 64 + ".test/t.csv",
        "https://" + "a." * 126 + "test/t.csv",  # host 256
        "https://x.test/" + "a" * 1_986,  # 2,001 characters
    ],
)
def test_a_url_without_a_valid_host_or_too_long_is_refused(url):
    assert valid_template_url(url) is False


@pytest.mark.parametrize(
    "url",
    ["https://x.test/%", "https://x.test/%zz", "https://x.test/a%2", "https://x.test/%2g.csv"],
)
def test_a_broken_percent_escape_is_refused(url):
    assert valid_template_url(url) is False


@pytest.mark.parametrize("end", [".", ",", ";", ":", "!", "?", "_", "~"])
def test_a_url_ending_in_what_an_autolinker_drops_is_refused(end):
    assert valid_template_url("https://x.test/t.csv" + end) is False
