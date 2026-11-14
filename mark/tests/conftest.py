import sys
from pathlib import Path

import pytest

_MARK = Path(__file__).resolve().parents[1]
for _path in (_MARK / "tests" / "fakes", _MARK / "code_steps", _MARK / "tests"):
    sys.path.insert(0, str(_path))

from opal_tms_sdk import tools  # noqa: E402


@pytest.fixture
def fake_tools():
    tools.reset()
    yield tools
    tools.reset()
