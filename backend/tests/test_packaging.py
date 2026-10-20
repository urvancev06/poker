"""Packaging: ``pip install -e backend`` must work.

setuptools refuses any file a ``pyproject.toml`` points at outside the project
directory ("Cannot access '../README.md' (or anything outside ...)"), which broke
the editable install. This guards every file the project table references.
"""

from __future__ import annotations

import tomllib
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent


def _referenced_files(project: dict) -> list[str]:
    files: list[str] = []
    readme = project.get("readme")
    if isinstance(readme, str):
        files.append(readme)
    elif isinstance(readme, dict) and "file" in readme:
        files.append(readme["file"])
    lic = project.get("license")
    if isinstance(lic, dict) and "file" in lic:
        files.append(lic["file"])
    files.extend(project.get("license-files", []))
    return files


def test_pyproject_references_only_files_inside_the_project():
    project = tomllib.loads((BACKEND / "pyproject.toml").read_text())["project"]
    files = _referenced_files(project)
    assert files, "expected at least a readme"
    for rel in files:
        path = (BACKEND / rel).resolve()
        assert path.is_relative_to(BACKEND), f"{rel} is outside {BACKEND}"
        assert path.is_file(), f"{rel} does not exist"
