# Workspace Manager

A command-line tool for managing workspaces with Git submodules and Go workspace integration.

## Features

- Sync workspace with remote repositories
- Manage Git submodules automatically
- Go workspace integration with `go.work` file management
- YAML-based configuration
- Debug mode support

## Installation

Requires Deno 2.4 or later.

```bash
# Clone the repository
git clone <repository-url>
cd workspace-manager

# Run the application
deno run --allow-all main.ts
```

## Usage

### Sync Command

Sync workspace with remote repositories:

```bash
deno run --allow-all main.ts sync [options]
```

**Options:**
- `-c, --config <file>` - Workspace config file (default: workspace.yml)
- `-w, --workspace-root <path>` - Workspace root directory (default: .)
- `-d, --debug` - Enable debug mode
- `-y, --yes` - Accept all changes (not yet implemented)

### Status Command

Show current workspace status:

```bash
deno run --allow-all main.ts status
```

*Note: Status command is not yet implemented.*

## Configuration

Create a `workspace.yml` file in your project root:

```yaml
workspaces:
  - url: git@github.com:user/repo.git
    path: tools/repo
    branch: main
    isGolang: false
    active: true
```

**Configuration Fields:**
- `url` - Git repository URL
- `path` - Local path for the submodule
- `branch` - Git branch to checkout
- `isGolang` - Whether this is a Go module (for go.work integration)
- `active` - Whether to include this workspace in sync

## Development

```bash
# Format code
deno task fmt

# Check formatting
deno task fmt:check

# Lint code
deno task lint

# Type check
deno task check
```

## TODO

The following improvements are planned based on code review:

### High Priority

- [ ] **Add schema validation** using Zod (already imported) for the workspace configuration
- [ ] **Implement the `--yes` option** to handle automatic confirmations when removing dirty directories
- [x] **Standardize error handling** - either use Result pattern consistently or handle errors uniformly
- [ ] **Add "update" command** to pull all submodules from tracking branches
- [ ] **Confirm before removing** - list what will be removed and let user confirm it

### Medium Priority

- [ ] **Improve git error reporting** by capturing stderr for better debugging instead of suppressing with `stderr: "null"`
- [ ] **Fix path handling** using proper path joining methods instead of string concatenation
- [ ] **Add input validation** for workspace URLs and paths to prevent invalid configurations
- [ ] **Handle dirty workspace** - use stash if possible to preserve uncommitted changes
- [ ] **Batch processing for "sync" command** - multiple modules at a time
- [ ] **Batch processing for "update" command** - multiple modules at a time

### Low Priority

- [ ] **Consider adding transaction-like behavior** to rollback changes if any step fails during sync
- [x] **Complete Go workspace path resolution** - fix TODO comments about prepending `goWorkRoot` to paths
- [ ] **Implement status command** to show current workspace state
- [ ] **Add confirmation prompts** for destructive operations when `--yes` is not specified
- [ ] **Add emoji to output** to make it more eye-catching
- [ ] **Add spinner for long-running actions** to improve user experience
- [ ] **Add install instruction using `deno install from jsdelivr`** for easier distribution

## Important Notes

### Renaming Workspaces or Changing URLs

**⚠️ Important:** Renaming a workspace or changing its URL requires special handling due to Git submodule limitations.

To rename a workspace or change its URL:

1. **Deactivate the workspace** by setting `active: false` in your `workspace.yml`
2. **Run sync** to remove the existing submodule: `deno run --allow-all main.ts sync`
3. **Make your changes** (rename path or change URL) in `workspace.yml`
4. **Reactivate the workspace** by setting `active: true`
5. **Run sync again** to add the workspace with new configuration: `deno run --allow-all main.ts sync`

This process ensures that Git submodules are properly removed and re-added with the new configuration, avoiding conflicts and corruption.

## Architecture

The project follows SOLID principles with a clean separation of concerns:

- `main.ts` - CLI entry point and command definitions
- `cmds/` - Command implementations
- `libs/` - Reusable utility libraries
  - `config.ts` - Configuration parsing
  - `errors.ts` - Custom error types
  - `file.ts` - File system utilities
  - `git.ts` - Git operations
  - `go.ts` - Go workspace management

## Error Handling

The project uses the `typescript-result` library for functional error handling, providing type-safe error propagation without exceptions.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
