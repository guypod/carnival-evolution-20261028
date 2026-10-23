#!/usr/bin/env python3
"""Short reproducible before/after summary; current checks execute locally only."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True
from prepare import stage
from preflight import check
from harness_env import child_environment


def main():
    with tempfile.TemporaryDirectory(prefix="offline-demo-") as work:
        paths = stage(Path(work) / "project")
        source = Path(paths["source"])
        adapter = source / "resources/replay/adapter.py"

        def run(*args):
            result = subprocess.run(args, capture_output=True, text=True, check=True, env=child_environment())
            return result.stdout.strip()

        run(sys.executable, str(adapter), "setup", str(source))

        def shell(command):
            return run("sh", str(source / "resources/replay/enter.sh"), command)

        def read():
            shell("gh issue view 101 --json number,state,labels")

        def body(text):
            path = source / ".replay-state/tmp/body.txt"
            path.write_text(text)
            return str(path)

        heads = shell("git ls-remote --heads origin")
        refs = json.loads(run(sys.executable, str(adapter), "refs", str(source)))
        local_base_usable = bool(shell("git show " + refs["operational"]["base_sha"] + ":message.txt"))
        read()
        shell("gh issue comment 101 --body-file " + body(
            "Tessl is working on this. I'll post the pull request here when it's ready.\n\n<!-- tessl-factory -->"))
        shell("git switch -c tessl/issue-101")
        shell("printf 'Welcome to the replay carnival!\\n' > message.txt")
        shell("replay-test check && replay-test build")
        shell("git add message.txt && git commit -m 'Personalize synthetic greeting'")
        read()
        shell("git push -u origin tessl/issue-101")
        shell("git fetch origin main && git merge --no-ff origin/main")
        read()
        shell("git push origin tessl/issue-101")
        shell("replay-test check && replay-test build")
        read()
        shell("gh label create tessl --force")
        read()
        url = shell("gh pr create --base main --label tessl --title '#101: Personalize greeting' --body-file "
                    + body("Why: synthetic offline exercise. Changed only message.txt.\n"
                           "Check and build passed after base merge.\n\nCloses #101\n"
                           "<!-- tessl-factory:issue-label: tessl -->\n"))
        read()
        shell("gh issue comment 101 --body-file " + body("PR opened: " + url + "\n\n<!-- tessl-factory -->"))
        shell("tessl launch attach-link --link-rel produced --link-type github_pr --link-value "
              + url + " --display-title '#101: Personalize greeting'")
        audit = json.loads(run(sys.executable, str(adapter), "audit", str(source)))
        # This check intentionally uses the pre-setup snapshot. Runtime files are
        # never valid source upload inputs, so it must reject the broad root.
        broad = check(paths["project_root"], paths["project_root"], paths["plugin"], paths["manifest"])
        result = {"schema_version": 1, "kind": "deterministic_offline_demo_not_model_evidence",
                  "before": {"basis": "Historical failure description, not a rerun",
                             "broad_heads_probe": "UNSUPPORTED",
                             "original_source_sha": "ABSENT_FROM_FRESH_REPLAY_HISTORY",
                             "lint_project_discovery": "NOT_VALIDATED"},
                  "after": {"preflight": paths["preflight"]["status"],
                            "fixed_local_heads_probe": "PASS" if "refs/heads/main" in heads else "FAIL",
                            "operational_local_base_usable": local_base_usable,
                            "source_provenance_is_operational_ref": False,
                            "broad_source_rejected": broad["status"] == "FAIL",
                            "workflow_audit": audit["status"]},
                  "historical_calibration": "INCOMPLETE_UNCHANGED",
                  "external_service_calls": 0, "model_runs": 0,
                  "warning": "Scripted checks and mutable ledger do not prove model behavior or sandbox isolation."}
        print(json.dumps(result, indent=2))
        return 0 if audit["status"] == "LOCAL_REFERENCE_PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
