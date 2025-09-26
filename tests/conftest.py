import asyncio
import inspect

import pytest


@pytest.hookimpl(tryfirst=True)
def pytest_pyfunc_call(pyfuncitem: pytest.Function) -> bool | None:
    """Allow async test functions without requiring pytest-asyncio."""
    if inspect.iscoroutinefunction(pyfuncitem.obj):
        asyncio.run(pyfuncitem.obj(**pyfuncitem.funcargs))
        return True
    return None
