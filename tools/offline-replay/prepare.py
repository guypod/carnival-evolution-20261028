#!/usr/bin/env python3
"""Stage only shipped synthetic fixtures into a NEW local directory; no downloads."""
import argparse
import json
from pathlib import Path
import shutil
import sys

sys.dont_write_bytecode = True
from preflight import digest, inventory, check, InvalidFixture

HERE = Path(__file__).resolve().parent
SOURCE_PATH = "bundle/scenarios/offline-greeting"
PLUGIN_PATH = "bundle/plugin"


def stage(output):
    output = Path(output).absolute()
    if output.exists() or output.resolve() != output:
        raise InvalidFixture("Output must be a new ordinary directory")
    pinned = json.loads((HERE / "fixture-manifest.json").read_text())
    if inventory(HERE / "resources") != pinned["resources_sha256"]:
        raise InvalidFixture("Shipped fixture resources differ from reviewed SHA-256 inventory")
    source = output / SOURCE_PATH
    source.mkdir(parents=True)
    shutil.copytree(HERE / "resources", source / "resources")
    plugin = output / PLUGIN_PATH
    plugin.mkdir()
    # Deliberately not the original skill: this validates packaging only.
    (plugin / "README.md").write_text("Synthetic packaging fixture, not an installed or invoked factory skill.\n")
    (output / "tessl.json").write_text('{"name":"synthetic-offline-project","private":true}\n')
    manifest = {"schema_version": 1, "source_path": SOURCE_PATH,
                "plugin_path": PLUGIN_PATH,
                "project_manifest_sha256": digest(output / "tessl.json"),
                "source_files_sha256": inventory(source),
                "plugin_files_sha256": inventory(plugin),
                "source_provenance_sha": pinned["source_provenance_sha"],
                "source_commit_is_operational_ref": False,
                "plugin_kind": "SYNTHETIC_BOUNDARY_FIXTURE_NOT_FACTORY_SKILL"}
    manifest_path = output / "review-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    result = check(output, source, plugin, manifest_path)
    if result["status"] != "LOCAL_PREFLIGHT_PASS":
        raise InvalidFixture("Staged preflight failed: " + str(result["errors"]))
    return {"project_root": str(output), "source": str(source), "plugin": str(plugin),
            "manifest": str(manifest_path), "preflight": result}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", help="New directory outside the repository is recommended")
    args = parser.parse_args()
    try:
        print(json.dumps(stage(args.output), indent=2))
    except (InvalidFixture, OSError, ValueError, KeyError) as error:
        parser.exit(1, str(error) + "\n")


if __name__ == "__main__":
    main()
