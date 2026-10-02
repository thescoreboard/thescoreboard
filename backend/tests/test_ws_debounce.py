"""
WS debounce gate — the trailing update of a burst must never be dropped.
"""
import os
import threading
import time

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SKIP_MIGRATIONS"] = "1"

from app.routers import matches as m


def _fresh_slug(name):
    """Each test uses its own slug so module-level state can't leak between tests."""
    return f"{name}-{time.monotonic_ns()}"


def test_first_push_passes_immediately():
    slug = _fresh_slug("a")
    t0 = time.monotonic()
    assert m._debounce_ws_push(slug) is True
    assert time.monotonic() - t0 < 0.05


def test_burst_second_push_waits_but_is_not_dropped():
    slug = _fresh_slug("b")
    assert m._debounce_ws_push(slug) is True
    t0 = time.monotonic()
    assert m._debounce_ws_push(slug) is True     # trailing push — waits, then passes
    assert time.monotonic() - t0 >= m._WS_DEBOUNCE_SECS * 0.5


def test_third_push_in_same_window_is_coalesced():
    slug = _fresh_slug("c")
    assert m._debounce_ws_push(slug) is True

    results = {}
    def trailing():
        results["b"] = m._debounce_ws_push(slug)
    t = threading.Thread(target=trailing)
    t.start()
    time.sleep(0.05)                              # let the trailing call start waiting
    results["c"] = m._debounce_ws_push(slug)      # third call in the same window
    t.join(timeout=2)

    assert results["b"] is True                   # trailing push happened
    assert results["c"] is False                  # duplicate coalesced into it
