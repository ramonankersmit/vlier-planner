from __future__ import annotations

import argparse
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONTEND_DIR = ROOT / "frontend"
BACKEND_STATIC_DIST = ROOT / "backend" / "static" / "dist"


def run(cmd: list[str], cwd: Path) -> None:
    subprocess.run(cmd, cwd=cwd, check=True)


def build_frontend(skip_install: bool) -> None:
    if not skip_install:
        run(["npm", "install"], FRONTEND_DIR)
    run(["npm", "run", "build"], FRONTEND_DIR)


def copy_dist() -> None:
    dist_dir = FRONTEND_DIR / "dist"
    if not dist_dir.exists():
        raise SystemExit("frontend build output not found; run npm run build first")

    if BACKEND_STATIC_DIST.exists():
        shutil.rmtree(BACKEND_STATIC_DIST)
    BACKEND_STATIC_DIST.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(dist_dir, BACKEND_STATIC_DIST)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build the frontend and copy it into the backend static directory.")
    parser.add_argument("--skip-install", action="store_true", help="Skip running npm install before the build.")
    parser.add_argument("--no-build", action="store_true", help="Skip npm run build and only copy the existing dist directory.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    if not args.no_build:
        build_frontend(skip_install=args.skip_install)

    copy_dist()


if __name__ == "__main__":
    main()
