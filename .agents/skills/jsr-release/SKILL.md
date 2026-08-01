---
name: jsr-release
description: Release a new version of a JSR package. Use this skill whenever the user wants to release, publish, tag, bump the version, or cut a new version of a package to JSR. Triggers on phrases like "release to JSR", "publish to JSR", "bump version", "cut a new tag", "release a new version", or any request to prepare or perform a JSR package release.
---

# JSR Package Release

Runs the pre-release quality gates, assesses the next semver version from commits, creates a git tag, and pushes it to trigger the JSR publish workflow.

## What it does

The release is fully scripted in `scripts/release.sh`. The script:

1. **Branch check** — refuses to run unless you are on `main`.
2. **Commits ahead of tag** — verifies there are new commits since the last git tag.
3. **Task discovery** — runs `deno task` to enumerate available tasks, then maps them to quality checks (fmt, lint, test, JSR dry-run). Falls back to direct `deno` commands if a task isn't available.
4. **Quality gates** — runs format check, lint, and tests using discovered tasks or direct deno commands. Fails the release if any check fails.
5. **JSR dry-run** — runs the discovered publish check task (e.g. `release:check`, `publish:check`) or falls back to `deno publish --dry-run`. Fails if the package isn't valid for JSR.
6. **Semver assessment** — inspects commits since the last tag and determines the bump level:
   - `BREAKING CHANGE` or `feat!` → major
   - `feat:` → minor (any feat commit triggers minor, regardless of fix commits)
   - otherwise → patch
7. **Confirmation** — shows the proposed version and asks for approval (skip with `--yes`).
8. **Version bump** — updates `version` in `deno.json` and commits it.
9. **Tag & push** — creates the git tag locally and pushes it to `origin`, which triggers the GitHub Actions JSR publish workflow.
10. **Push commit** — pushes the version-bump commit to `main` so the `deno.json` change is not left local-only.

## Usage

The agent runs the script directly. Users do not need to invoke it themselves.

```bash
# The agent invokes:
.agents/skills/jsr-release/scripts/release.sh --yes

# Optional: override the semver assessment
.agents/skills/jsr-release/scripts/release.sh --yes --bump minor
```

## What you should do

1. Run `.agents/skills/jsr-release/scripts/release.sh --yes` from the repository root.
2. Report the output back to the user — especially the new tag name and whether all checks passed.
3. If any check fails, report the failure and stop. Do not attempt to bypass or fix the failure automatically.

## Important notes

- The script resolves the repository root from its own location, so it can be invoked from anywhere.
- The `--yes` flag is required when the agent invokes it so it does not block on interactive input.
- The script updates `deno.json` and creates a commit for the version bump before tagging.
- The version-bump commit is pushed to `main` (not just the tag), so `deno.json` stays in sync on the remote.
- Pushing the tag triggers the GitHub Actions workflow (`.github/workflows/publish.yml`) which publishes to JSR.
