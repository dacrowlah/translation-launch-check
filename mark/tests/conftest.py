import os
import sys

import pytest

# pytest puts this folder (tests/) on sys.path before it imports this conftest.
from builders import EXAMPLE_CONFIG, MARK_DIR

for _path in (MARK_DIR / "tests" / "fakes", MARK_DIR / "code_steps"):
    sys.path.insert(0, str(_path))

# Tests always read the example file, never a developer's real mark/local.config.json.
os.environ["TLC_CONFIG"] = str(EXAMPLE_CONFIG)

from opal_tms_sdk import tools  # noqa: E402


@pytest.fixture
def fake_tools():
    tools.reset()
    yield tools
    tools.reset()
