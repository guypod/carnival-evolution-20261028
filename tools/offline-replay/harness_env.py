"""Minimal child environment for our deterministic synthetic harness only.

Direct adapter setup still rejects ambient service credentials. This helper does
not read, copy or log credential values and is not a general security sandbox.
"""
import os


def child_environment(extra=None):
    env = {"PATH": os.environ.get("PATH", os.defpath),
           "LC_ALL": "C", "PYTHONDONTWRITEBYTECODE": "1"}
    if extra:
        env.update(extra)
    return env
