"""In-memory stand-in for Mark's preinstalled opal_tms_sdk (tests only)."""


class _SdkError(Exception):
    """The SDK's four recorded exception classes (from its source). Their real base class is
    unverified; Exception is assumed here. call_tool catches Exception, so a BaseException
    subclass in the real SDK would need a code change."""


class ToolInvocationError(_SdkError):
    pass


class ToolUnavailableError(_SdkError):
    pass


class ToolValidationError(_SdkError):
    pass


class ProxyChannelError(_SdkError):
    pass


class UnscriptedCall(BaseException):
    """A tool called without a scripted response. A BaseException on purpose: call_tool and
    run_safely catch Exception, so a typo in a tool name can't pass as "unavailable"."""


class _Tools:
    def __init__(self):
        self.reset()

    def reset(self):
        self.calls = []
        self._responses = {}

    def respond(self, tool, value):
        """Script what `tools.<tool>(...)` returns; an exception instance is raised instead,
        as the SDK's own exception classes would be."""
        assert not isinstance(value, type), "script an exception instance, not a class"
        self._responses[tool] = value

    def __getattr__(self, tool):
        if tool.startswith("_"):
            raise AttributeError(tool)
        return lambda **params: self._invoke(tool, params)

    def _invoke(self, tool, params):
        self.calls.append((tool, params))
        if tool not in self._responses:
            raise UnscriptedCall(tool)
        value = self._responses[tool]
        if isinstance(value, BaseException):
            raise value
        return value


tools = _Tools()
