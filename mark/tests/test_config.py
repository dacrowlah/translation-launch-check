import importlib
import json

import _config
from _config import RULES


def test_config_reads_rules_from_the_tool():
    assert RULES["locales"]["ja-JP"]["language"] == "ja" and "severities" not in RULES


def test_private_defaults_to_the_example_file():
    assert _config.PRIVATE["qa_inbox"] == "owner@example.com"


def test_private_reads_the_file_named_by_tlc_config(tmp_path, monkeypatch):
    path = tmp_path / "c.json"
    path.write_text(json.dumps({"qa_inbox": "me@x.test"}), encoding="utf-8")
    monkeypatch.setenv("TLC_CONFIG", str(path))
    assert importlib.reload(_config).PRIVATE == {"qa_inbox": "me@x.test"}
    monkeypatch.delenv("TLC_CONFIG")
    importlib.reload(_config)
