#!/usr/bin/env python3
"""Run a command inside the isolated release env and record exit code + metadata.

Usage: python3 check-run.py <name> <cwd> <cmd> [args...]
Writes logs/<name>.log and check/<name>.json, then exits with the command's code.
"""
import json
import os
import subprocess
import sys
import time


def main() -> int:
    if len(sys.argv) < 4:
        print(__doc__)
        return 2
    name, cwd, cmd = sys.argv[1], sys.argv[2], sys.argv[3:]
    root = os.environ.get("ROOT")
    if not root:
        print("ROOT is not set; source env.sh first", file=sys.stderr)
        return 2
    log_path = os.path.join(root, "logs", f"{name}.log")
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    os.makedirs(os.path.join(root, "check"), exist_ok=True)

    started = time.time()
    with open(log_path, "wb") as log:
        proc = subprocess.run(cmd, cwd=cwd, stdout=log, stderr=subprocess.STDOUT)
    record = {
        "name": name,
        "cwd": cwd,
        "cmd": cmd,
        "exit": proc.returncode,
        "duration_s": round(time.time() - started, 2),
        "log": log_path,
        "registry": os.environ.get("NPM_CONFIG_REGISTRY"),
        "home": os.environ.get("HOME"),
    }
    with open(os.path.join(root, "check", f"{name}.json"), "w", encoding="utf-8") as out:
        json.dump(record, out, indent=2)
        out.write("\n")
    print(json.dumps(record))
    return proc.returncode


if __name__ == "__main__":
    sys.exit(main())
