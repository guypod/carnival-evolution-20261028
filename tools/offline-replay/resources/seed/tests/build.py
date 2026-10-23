from pathlib import Path
value = Path("message.txt").read_bytes()
assert value.decode("utf-8").strip() and len(value) < 100
assert value.endswith(b"\n") and b"\x00" not in value
print("PASS: UTF-8 text build contract")
