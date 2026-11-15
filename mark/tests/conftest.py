import os
import sys

import pytest

# pytest puts this folder (tests/) on sys.path before it imports this conftest.
from builders import EXAMPLE_CONFIG, MARK_DIR

# MARK_DIR too, so tests import the build modules (_build.agents) as build.py does; the
# repo's scripts/ so tests import the command-line scripts (send_package, catch_rate).
_SCRIPTS = MARK_DIR.parent / "scripts"
for _path in (MARK_DIR, MARK_DIR / "tests" / "fakes", MARK_DIR / "code_steps", _SCRIPTS):
    sys.path.insert(0, str(_path))

# Tests always read the example file, never a developer's real mark/local.config.json.
os.environ["TLC_CONFIG"] = str(EXAMPLE_CONFIG)

from opal_tms_sdk import tools  # noqa: E402


@pytest.fixture
def fake_tools():
    tools.reset()
    yield tools
    tools.reset()
