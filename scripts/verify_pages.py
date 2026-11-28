"""Verify that the public ChemBoard site serves the current main branch."""

import argparse
from http.client import HTTPException
import os
from pathlib import Path
import subprocess
import time
from urllib.parse import quote
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
SITE = "https://henriquecsj.github.io/chemboard/"
MAIN = "refs/heads/main"


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT, timeout=20)


def main_tip():
    return git("ls-remote", "--exit-code", "origin", MAIN).split()[0].decode("ascii")


def release_files(commit):
    if git("rev-parse", "HEAD").decode("ascii").strip() != commit:
        git("fetch", "--no-tags", "--no-write-fetch-head", "origin", commit)
    assets = git(
        "ls-tree", "-r", "-z", "--name-only", commit,
        "--", "examples", "docs/images", "docs/media",
    ).decode("utf-8").split("\x00")
    return {
        path: git("cat-file", "blob", f"{commit}:{path}")
        for path in ("index.html", "favicon.png", *filter(None, assets))
    }


def check_public(files):
    for path, expected in files.items():
        # Check the usual URL to include the public cache in the verification.
        url = SITE if path == "index.html" else SITE + quote(path)
        request = Request(url, headers={
            "Cache-Control": "no-cache",
            "User-Agent": "ChemBoard Pages verification",
        })
        try:
            with urlopen(request, timeout=12) as response:
                if response.status != 200:
                    return f"{url} returned HTTP {response.status}"
                if response.read(len(expected) + 1) != expected:
                    return f"{url} differs from main"
        except (OSError, HTTPException) as error:
            return f"{url} could not be checked ({error})"
    return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--wait", type=int, default=0, help="retry window in seconds")
    args = parser.parse_args()
    if args.wait < 0:
        parser.error("--wait must be zero or greater")
    deadline = time.monotonic() + args.wait
    target = None
    while True:
        try:
            newest = main_tip()
            if newest != target:
                files = release_files(newest)
                target = newest
                print(f"Checking {len(files)} files against main at {target[:12]}", flush=True)
            failure = check_public(files)
            if failure is None and main_tip() != target:
                failure = "main advanced during verification"
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
            failure = f"Could not read main ({error})"

        if failure is None:
            result = f"Verified {len(files)} public files against main at {target}."
            print(result)
            if summary := os.environ.get("GITHUB_STEP_SUMMARY"):
                with open(summary, "a", encoding="utf-8") as output:
                    output.write(f"{result}\n\n[Open ChemBoard]({SITE})\n")
            return
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            parser.exit(1, f"GitHub Pages verification failed. {failure}\n")
        print(f"Waiting for publication. {failure}", flush=True)
        time.sleep(min(15, remaining))


if __name__ == "__main__":
    main()
