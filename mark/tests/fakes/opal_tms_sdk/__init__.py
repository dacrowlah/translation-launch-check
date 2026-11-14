"""In-memory stand-in for Mark's preinstalled opal_tms_sdk (tests only)."""


class _Tools:
    def __init__(self):
        self.reset()

    def reset(self):
        self.calls = []
        self._responses = {}

    def respond(self, name, value):
        self._responses[name] = value

    def __getattr__(self, name):
        if name.startswith("_"):
            raise AttributeError(name)
        return lambda **params: self._invoke(name, params)

    def _invoke(self, name, params):
        self.calls.append((name, params))
        return self._responses[name]


tools = _Tools()
