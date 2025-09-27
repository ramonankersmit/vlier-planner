import pytest

from backend import updater


@pytest.fixture(autouse=True)
def reset_shutdown_callback():
    updater.register_shutdown_callback(None)
    yield
    updater.register_shutdown_callback(None)


def test_request_app_shutdown_without_callback(monkeypatch):
    exit_calls: list[int] = []

    def fake_exit(code: int) -> None:
        exit_calls.append(code)

    monkeypatch.setattr(updater.os, "_exit", fake_exit)

    updater._request_app_shutdown()

    assert exit_calls == [0]


def test_request_app_shutdown_with_callback(monkeypatch):
    callback_calls: list[None] = []

    def callback() -> None:
        callback_calls.append(None)

    exit_calls: list[int] = []

    class DummyTimer:
        def __init__(self, interval: float, func):
            self.interval = interval
            self.func = func
            self.started = False

        def start(self) -> None:
            self.started = True

    timers: list[DummyTimer] = []

    def fake_timer(interval: float, func):
        timer = DummyTimer(interval, func)
        timers.append(timer)
        return timer

    monkeypatch.setattr(updater.threading, "Timer", fake_timer)
    monkeypatch.setattr(updater.os, "_exit", lambda code: exit_calls.append(code))

    updater.register_shutdown_callback(callback)
    updater._request_app_shutdown()

    assert callback_calls == [None]
    assert exit_calls == []
    assert timers and timers[0].interval == updater._FORCED_EXIT_DELAY_SECONDS
    assert timers[0].started is True


def test_request_app_shutdown_callback_failure(monkeypatch):
    def callback() -> None:
        raise RuntimeError("boom")

    exit_calls: list[int] = []

    def fake_exit(code: int) -> None:
        exit_calls.append(code)

    monkeypatch.setattr(updater.os, "_exit", fake_exit)

    updater.register_shutdown_callback(callback)
    updater._request_app_shutdown()

    assert exit_calls == [0]
