from pathlib import Path
import os
value = Path("message.txt").read_text()
assert value == os.environ.get("REPLAY_EXPECTED", "Welcome to the replay carnival!\n"), repr(value)
print("PASS: exact requested greeting and final newline")
