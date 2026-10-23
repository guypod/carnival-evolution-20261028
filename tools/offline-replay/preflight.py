#!/usr/bin/env python3
"""Read-only local boundary checks. Never submit, price, lint, link or run an eval."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import sys


class InvalidFixture(ValueError):
    pass


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def relative(value):
    if not isinstance(value, str) or not value:
        raise InvalidFixture("Empty or non-string boundary")
    path = PurePosixPath(value)
    if path.is_absolute() or path.as_posix() != value or any(p in (".", "..") for p in value.split("/")) or "\\" in value:
        raise InvalidFixture("Boundary must be a normalized relative path")
    return path


def inventory(root):
    root = Path(root)
    if root.is_symlink() or not root.is_dir():
        raise InvalidFixture("Boundary must be an ordinary directory")
    result = {}
    for p in sorted(root.rglob("*")):
        if p.is_symlink() or not (p.is_dir() or p.is_file()):
            raise InvalidFixture("Links and special files are not allowed")
        if p.is_file():
            result[p.relative_to(root).as_posix()] = digest(p)
    return result


def check(project_root, source, plugin, manifest_path):
    """The caller supplies a reviewed manifest outside both candidate boundaries."""
    result = {"schema_version": 1, "kind": "offline_preflight_not_submission",
              "status": "FAIL", "checks": {}, "errors": [],
              "external_service_calls": 0, "model_runs": 0,
              "remote_project_validation": "NOT_PERFORMED",
              "historical_calibration": "INCOMPLETE_UNCHANGED"}
    checks = result["checks"]
    try:
        project = Path(project_root).absolute()
        source, plugin, manifest_path = map(lambda p: Path(p).absolute(), (source, plugin, manifest_path))
        for p in (project, source, plugin, manifest_path):
            if p.resolve() != p:
                raise InvalidFixture("Symlink or non-normalized path in boundary")
        manifest = json.loads(manifest_path.read_text())
        if not isinstance(manifest, dict) or type(manifest.get("schema_version")) is not int or manifest["schema_version"] != 1:
            raise InvalidFixture("Unsupported manifest version")
        expected_source = project / relative(manifest["source_path"])
        expected_plugin = project / relative(manifest["plugin_path"])
        # Narrow shape is required independently of the supplied inventory.
        if expected_source.parent.name != "scenarios" or expected_plugin.name != "plugin":
            raise InvalidFixture("Expected one scenarios/<name> source and one plugin directory")
        if source != expected_source or plugin != expected_plugin:
            raise InvalidFixture("Source/plugin boundary differs from the reviewed narrow paths")
        if source == project or plugin == project or source.is_relative_to(plugin) or plugin.is_relative_to(source):
            raise InvalidFixture("Broad or overlapping source/plugin roots")
        if manifest_path.is_relative_to(source) or manifest_path.is_relative_to(plugin):
            raise InvalidFixture("Review manifest must be outside source and plugin")
        checks["narrow_boundaries"] = True
        nearest = next((p / "tessl.json" for p in (source, *source.parents)
                        if (p / "tessl.json").is_file()), None)
        if nearest != project / "tessl.json":
            raise InvalidFixture("Nearest source project ancestor does not match expected project")
        if nearest.is_symlink() or digest(nearest) != manifest["project_manifest_sha256"]:
            raise InvalidFixture("Project manifest differs from the reviewed local project")
        checks["project_ancestor_matches"] = True
        for label, root in (("source", source), ("plugin", plugin)):
            actual = inventory(root)
            expected = manifest[label + "_files_sha256"]
            if not isinstance(expected, dict) or not expected or actual != expected:
                raise InvalidFixture(label + " inventory or SHA-256 differs from reviewed fixture")
            checks[label + "_inventory_matches"] = True
        config = json.loads((source / "resources/replay/config.json").read_text())
        if not isinstance(config, dict):
            raise InvalidFixture("Source config must be a JSON object")
        provenance = manifest["source_provenance_sha"]
        if not isinstance(provenance, str) or not re.fullmatch(r"[0-9a-f]{40}", provenance):
            raise InvalidFixture("Source provenance must be a full lowercase SHA-1")
        if config.get("source_base_sha") != manifest["source_provenance_sha"]:
            raise InvalidFixture("Source provenance SHA does not match reviewed provenance")
        if manifest.get("source_commit_is_operational_ref") is not False:
            raise InvalidFixture("Source provenance must not be an operational replay ref")
        checks["source_provenance_matches"] = True
        result["status"] = "LOCAL_PREFLIGHT_PASS"
    except (InvalidFixture, OSError, ValueError, TypeError, KeyError) as error:
        result["errors"].append(str(error))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for flag in ("project-root", "source", "plugin", "manifest"):
        parser.add_argument("--" + flag, required=True)
    args = parser.parse_args()
    result = check(args.project_root, args.source, args.plugin, args.manifest)
    print(json.dumps(result, indent=2))
    return 0 if result["status"] == "LOCAL_PREFLIGHT_PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
