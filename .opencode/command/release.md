---
description: Release new version
agent: build
---

# Version Release Process for Workspace Manager

## Version Bumping Steps

### 1. Determine Next Version Number
Choose appropriate version bump based on changes:
- **Patch**: Increment the patch version (e.g., `0.0.1-rc10` → `0.0.1-rc11`) for bug fixes and small improvements
- **Minor**: Increment the minor version (e.g., `0.0.1-rc10` → `0.1.0-rc1`) for new features and enhancements
- **Major**: Increment the major version (e.g., `0.0.1-rc10` → `1.0.0-rc1`) for breaking changes and milestone releases
- **Release**: Remove the rc suffix (e.g., `0.0.1-rc10` → `0.0.1`) for stable releases

### 2. Update Version in Source Files

**Update the version constant in `main.ts`:**
- Locate the `VERSION` constant definition
- Update it to the new version number

**Update installation instructions in `README.md`:**
- Find the installation command with the CDN URL
- Update the version tag in the URL to match the new version

**Update deployment documentation in `README.md`:**
- Locate any additional documentation sections showing version numbers
- Ensure all version references are updated consistently

### 3. Build the Project
```bash
# Run the build task to regenerate the compiled bundle
deno task build
```

This will:
- Bundle the main TypeScript file into the compiled JavaScript bundle
- Automatically embed the new version constant
- Create an updated executable bundle

### 4. Verify the Changes
```bash
# Check that version was updated in the source file
grep 'const VERSION' main.ts

# Check that documentation references are updated
grep 'workspace-manager@v' README.md

# Verify the built file contains the new version
grep 'var VERSION' build/cli.js
```

### 5. Test the Build
```bash
# Test that the new version works correctly
deno run --allow-all build/cli.js --version

# Should output the new version number
```

### 6. Git Operations
```bash
# Stage the changed files
git add main.ts README.md build/cli.js

# Create a descriptive commit message
git commit -m "chore: bump version to [NEW_VERSION]"

# Create a git tag for the release
git tag v[NEW_VERSION]

# Push changes and tag to remote
git push origin main
git push origin v[NEW_VERSION]
```

### 7. Release Preparation (Optional)
For stable releases (non-rc):
- Update release notes or CHANGELOG.md if present
- Review and update any additional documentation
- Verify all installation instructions work correctly

## Key Files to Update
- **Source files**: Update version constants and documentation references
- **Build output**: Regenerate compiled bundles via build task
- **Documentation**: Ensure all user-facing instructions reflect the new version

## Build Commands Reference
```bash
# Development and build tasks
deno task check          # Type checking
deno task fmt            # Format code
deno task lint           # Lint code
deno task build          # Build production bundle
deno task local-install  # Install locally for testing
```

This generic playbook ensures all version references are consistently updated and the project is properly built and tagged for release.