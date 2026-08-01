#!/usr/bin/env bash
#
# release.sh — Quality gate + release script for JSR packages
#
# Runs pre-release checks, assesses the next semver version from commits,
# creates a git tag, and pushes it to trigger the JSR publish workflow.
#
# Usage:
#   ./scripts/release.sh           # interactive (asks for confirmation)
#   ./scripts/release.sh --yes     # skip confirmation, auto-release
#   ./scripts/release.sh --bump major|minor|patch  # override semver assessment
#

set -euo pipefail

# ── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

info()    { echo -e "${CYAN}  $*${NC}"; }
ok()      { echo -e "${GREEN}  ✓ $*${NC}"; }
warn()    { echo -e "${YELLOW}  ⚠ $*${NC}"; }
fail()    { echo -e "${RED}  ✗ $*${NC}" >&2; }
step()    { echo -e "\n${BOLD}${CYAN}▶ $*${NC}"; }

die() { fail "$1"; exit 1; }

# ── Args ────────────────────────────────────────────────────────────────────
SKIP_CONFIRM=false
OVERRIDE_BUMP=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes|-y) SKIP_CONFIRM=true; shift ;;
    --bump)   OVERRIDE_BUMP="$2"; shift 2 ;;
    --help|-h)
      echo "Usage: ./scripts/release.sh [--yes] [--bump major|minor|patch]"
      exit 0
      ;;
    *) die "Unknown argument: $1" ;;
  esac
done

if [[ -n "$OVERRIDE_BUMP" && ! "$OVERRIDE_BUMP" =~ ^(major|minor|patch)$ ]]; then
  die "--bump must be one of: major, minor, patch"
fi

# ── Root ────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
cd "$REPO_ROOT"

# ── 1. Branch check ─────────────────────────────────────────────────────────
step "Checking branch"

CURRENT_BRANCH="$(git branch --show-current)"
if [[ "$CURRENT_BRANCH" != "main" ]]; then
  die "Not on main branch (currently on '$CURRENT_BRANCH'). Switch to main before releasing."
fi
ok "On main branch"

# ── 2. Commits ahead of latest tag ──────────────────────────────────────────
step "Checking commits ahead of latest tag"

LATEST_TAG="$(git describe --tags --abbrev=0 2>/dev/null || true)"

if [[ -z "$LATEST_TAG" ]]; then
  info "No existing tags found — all commits are release candidates."
  COMMITS_SINCE_TAG="$(git rev-list --count HEAD)"
else
  COMMITS_SINCE_TAG="$(git rev-list --count "${LATEST_TAG}..HEAD")"
  info "Latest tag: $LATEST_TAG ($COMMITS_SINCE_TAG commits ahead)"
fi

if [[ "$COMMITS_SINCE_TAG" -eq 0 ]]; then
  die "No new commits since the last tag ($LATEST_TAG). Nothing to release."
fi
ok "$COMMITS_SINCE_TAG commit(s) ahead of latest tag"

# ── 3. Discover available deno tasks ────────────────────────────────────────
step "Discovering available deno tasks"

AVAILABLE_TASKS="$(deno task 2>/dev/null | sed 's/\x1b\[[0-9;]*m//g' || true)"

# Helper: check if a task name exists in the available tasks list
has_task() {
  echo "$AVAILABLE_TASKS" | grep -qE "^- $1([[:space:]]|$)"
}

# Find the best task for each quality check
FMT_TASK=""
LINT_TASK=""
TEST_TASK=""
JSR_DRYRUN_TASK=""

# fmt: prefer fmt:check, then fmt
if has_task "fmt:check"; then
  FMT_TASK="fmt:check"
elif has_task "fmt"; then
  FMT_TASK="fmt"
fi

# lint: prefer lint, then lint:check
if has_task "lint"; then
  LINT_TASK="lint"
elif has_task "lint:check"; then
  LINT_TASK="lint:check"
fi

# test: prefer test, then test:unit, then test:integration
if has_task "test"; then
  TEST_TASK="test"
elif has_task "test:unit"; then
  TEST_TASK="test:unit"
fi

# JSR dry-run: prefer release:check, then publish:check, then jsr:check, then jsr:publish
for candidate in release:check publish:check jsr:check jsr:publish; do
  if has_task "$candidate"; then
    JSR_DRYRUN_TASK="$candidate"
    break
  fi
done

ok "Discovered tasks — fmt: ${FMT_TASK:-none}, lint: ${LINT_TASK:-none}, test: ${TEST_TASK:-none}, jsr-dryrun: ${JSR_DRYRUN_TASK:-none}"

# ── 4. Quality gate: format check ───────────────────────────────────────────
step "Running quality gate: format check"

if [[ -n "$FMT_TASK" ]]; then
  if deno task "$FMT_TASK"; then
    ok "deno task $FMT_TASK passed"
  else
    die "deno task $FMT_TASK failed — fix formatting before releasing."
  fi
else
  # Fallback: direct deno fmt check
  if deno fmt --check; then
    ok "deno fmt --check passed"
  else
    die "deno fmt --check failed — fix formatting before releasing."
  fi
fi

# ── 5. Quality gate: lint ───────────────────────────────────────────────────
step "Running quality gate: lint"

if [[ -n "$LINT_TASK" ]]; then
  if deno task "$LINT_TASK"; then
    ok "deno task $LINT_TASK passed"
  else
    die "deno task $LINT_TASK failed — fix lint errors before releasing."
  fi
else
  # Fallback: direct deno lint
  if deno lint; then
    ok "deno lint passed"
  else
    die "deno lint failed — fix lint errors before releasing."
  fi
fi

# ── 6. Quality gate: tests ──────────────────────────────────────────────────
step "Running quality gate: tests"

if [[ -n "$TEST_TASK" ]]; then
  if deno task "$TEST_TASK"; then
    ok "deno task $TEST_TASK passed"
  else
    die "deno task $TEST_TASK failed — fix failing tests before releasing."
  fi
else
  # Fallback: direct deno test
  if deno test; then
    ok "deno test passed"
  else
    die "deno test failed — fix failing tests before releasing."
  fi
fi

# ── 7. Quality gate: JSR dry-run ────────────────────────────────────────────
step "Running quality gate: JSR dry-run"

if [[ -n "$JSR_DRYRUN_TASK" ]]; then
  if deno task "$JSR_DRYRUN_TASK"; then
    ok "deno task $JSR_DRYRUN_TASK passed (JSR dry-run OK)"
  else
    die "deno task $JSR_DRYRUN_TASK failed — the package is not ready for JSR."
  fi
else
  # Fallback: direct jsr publish --dry-run
  if deno publish --dry-run 2>/dev/null || jsr publish --dry-run 2>/dev/null; then
    ok "JSR dry-run passed"
  else
    die "JSR dry-run failed — the package is not ready for JSR."
  fi
fi

# ── 8. Semver assessment ────────────────────────────────────────────────────
step "Assessing next version"

if [[ -z "$LATEST_TAG" ]]; then
  # No prior tag — parse current version from deno.json or start at 1.0.0
  CURRENT_VERSION="$(node -p "require('./deno.json').version" 2>/dev/null || echo "1.0.0")"
  # Use the version in deno.json as the baseline for the new tag
  BASE_MAJOR="$(echo "$CURRENT_VERSION" | cut -d. -f1)"
  BASE_MINOR="$(echo "$CURRENT_VERSION" | cut -d. -f2)"
  BASE_PATCH="$(echo "$CURRENT_VERSION" | cut -d. -f3)"
else
  # Strip leading 'v'
  CURRENT_VERSION="${LATEST_TAG#v}"
  BASE_MAJOR="$(echo "$CURRENT_VERSION" | cut -d. -f1)"
  BASE_MINOR="$(echo "$CURRENT_VERSION" | cut -d. -f2)"
  BASE_PATCH="$(echo "$CURRENT_VERSION" | cut -d. -f3)"
fi

# Determine bump level from commits since last tag (or all commits if no tag)
if [[ -z "$LATEST_TAG" ]]; then
  COMMIT_RANGE="HEAD~${COMMITS_SINCE_TAG}..HEAD"
  # If COMMITS_SINCE_TAG equals total commits, we can't use HEAD~N..HEAD for N = all
  # Use a safe range
  if [[ "$COMMITS_SINCE_TAG" -ge "$(git rev-list --count HEAD)" ]]; then
    COMMIT_RANGE="$(git rev-list --max-parents=0 HEAD)..HEAD"
  fi
else
  COMMIT_RANGE="${LATEST_TAG}..HEAD"
fi

BUMP_LEVEL="${OVERRIDE_BUMP:-patch}"

# Check for breaking changes first (highest priority)
if git log --oneline "$COMMIT_RANGE" | grep -qiE '(BREAKING CHANGE|^[a-z0-9]+! )'; then
  BUMP_LEVEL="major"
elif git log --oneline "$COMMIT_RANGE" | grep -qE '^feat(\(.+\))?:'; then
  # Any feat: commit → minor bump, regardless of fix: commits
  BUMP_LEVEL="minor"
fi

case "$BUMP_LEVEL" in
  major)
    NEW_MAJOR=$((BASE_MAJOR + 1))
    NEW_VERSION="${NEW_MAJOR}.0.0"
    ;;
  minor)
    NEW_MINOR=$((BASE_MINOR + 1))
    NEW_VERSION="${BASE_MAJOR}.${NEW_MINOR}.0"
    ;;
  patch)
    NEW_PATCH=$((BASE_PATCH + 1))
    NEW_VERSION="${BASE_MAJOR}.${BASE_MINOR}.${NEW_PATCH}"
    ;;
esac

NEW_TAG="v${NEW_VERSION}"

info "Current version:  $CURRENT_VERSION"
info "Bump level:        $BUMP_LEVEL"
info "New version:       $NEW_VERSION"
info "New tag:           $NEW_TAG"

# ── 9. Confirmation ─────────────────────────────────────────────────────────
if [[ "$SKIP_CONFIRM" != true ]]; then
  echo ""
  echo -e "${BOLD}Summary${NC}"
  echo "  Branch:   $CURRENT_BRANCH"
  echo "  Commits:  $COMMITS_SINCE_TAG since $LATEST_TAG"
  echo "  Bump:     $BUMP_LEVEL"
  echo "  Tag:      $NEW_TAG"
  echo ""
  read -r -p "Create and push tag $NEW_TAG? [y/N] " -n 1
  echo
  if [[ ! "$REPLY" =~ ^[Yy]$ ]]; then
    info "Aborted."
    exit 0
  fi
fi

# ── 9. Update deno.json version ─────────────────────────────────────────────
step "Updating version in deno.json"

# Use a portable sed-free approach via python
python3 -c "
import json, sys
with open('deno.json') as f:
    data = json.load(f)
if data.get('version') != '$NEW_VERSION':
    data['version'] = '$NEW_VERSION'
    with open('deno.json', 'w') as f:
        json.dump(data, f, indent=2)
        f.write('\n')
    print('Updated deno.json version → $NEW_VERSION')
else:
    print('Version already $NEW_VERSION, no change needed')
"

# ── 10. Commit version bump ──────────────────────────────────────────────────
step "Committing version bump"

git add deno.json
if ! git diff --cached --quiet; then
  git commit -m "chore: bump version to $NEW_VERSION"
  ok "Committed version bump"
else
  info "No version change to commit (already at $NEW_VERSION)"
fi

# ── 11. Create & push tag ────────────────────────────────────────────────────
step "Creating and pushing tag"

if git tag | grep -q "^${NEW_TAG}$"; then
  die "Tag $NEW_TAG already exists locally."
fi

git tag "$NEW_TAG"
ok "Tag $NEW_TAG created"

info "Pushing tag to remote..."
if git push origin "$NEW_TAG"; then
  ok "Tag $NEW_TAG pushed to origin"
else
  die "Failed to push tag $NEW_TAG."
fi

# ── 12. Push version bump commit to main ─────────────────────────────────────
step "Pushing version bump to main"

if git push origin "$CURRENT_BRANCH"; then
  ok "Version bump commit pushed to $CURRENT_BRANCH"
else
  die "Failed to push version bump to $CURRENT_BRANCH."
fi

# ── Done ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}✓ Released $NEW_TAG${NC}"
echo ""
echo "  The GitHub Actions workflow will now publish to JSR."
if [[ -n "${GITHUB_REPOSITORY:-}" ]]; then
  echo "  Watch: https://github.com/${GITHUB_REPOSITORY}/actions"
fi
echo ""
