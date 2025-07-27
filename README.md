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

### Global Installation (Recommended)

Install globally using Deno:

```bash
deno install -fr --global --allow-run --allow-write --allow-read --allow-env --allow-net --name workspace-manager https://cdn.jsdelivr.net/gh/ball6847/workspace-manager@v0.0.1-rc5/build/cli.js
```

After installation, you can use the tool from anywhere:

```bash
workspace-manager sync
workspace-manager update
workspace-manager enable
workspace-manager disable
```

### Uninstall

To uninstall the global installation:

```bash
deno uninstall workspace-manager
```

### Local Development

Alternatively, clone and run locally:

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
# Using global installation
workspace-manager sync [options]

```

**Options:**
- `-c, --config <file>` - Workspace config file (default: workspace.yml)
- `-w, --workspace-root <path>` - Workspace root directory (default: .)
- `-d, --debug` - Enable debug mode
- `-j, --concurrency <number>` - Number of concurrent operations (default: 2)
- `-y, --yes` - Accept all changes (not yet implemented)

### Update Command

Update all submodules by checking out to tracking branches and pulling latest changes:

```bash
# Using global installation
workspace-manager update [options]

```

**Options:**
- `-c, --config <file>` - Workspace config file (default: workspace.yml)
- `-w, --workspace-root <path>` - Workspace root directory (default: .)
- `-d, --debug` - Enable debug mode
- `-j, --concurrency <number>` - Number of concurrent operations (default: 2)

### Enable Command

Enable a disabled workspace repository by setting its `active` property to `true`:

```bash
# Using global installation
workspace-manager enable [options]

```

This command will:
1. Show a list of disabled workspaces (where `active: false`)
2. Allow you to select which workspace to enable
3. Update the workspace configuration file
4. Optionally sync the workspace immediately

**Options:**
- `-c, --config <file>` - Workspace config file (default: workspace.yml)
- `-w, --workspace-root <path>` - Workspace root directory (default: .)
- `-d, --debug` - Enable debug mode
- `-y, --yes` - Automatically sync after enabling without prompting

### Disable Command

Disable an active workspace repository by setting its `active` property to `false`:

```bash
# Using global installation
workspace-manager disable [options]

```

This command will:
1. Show a list of active workspaces (where `active: true`)
2. Allow you to select which workspace to disable
3. Update the workspace configuration file
4. Optionally sync the workspace immediately to remove it from the filesystem

**Options:**
- `-c, --config <file>` - Workspace config file (default: workspace.yml)
- `-w, --workspace-root <path>` - Workspace root directory (default: .)
- `-d, --debug` - Enable debug mode
- `-y, --yes` - Automatically sync after disabling without prompting

### Status Command

Show current workspace status:

```bash
# Using global installation
workspace-manager status

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

For contributors working on the workspace-manager project:

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
- [x] **Add "update" command** to pull all submodules from tracking branches
- [ ] **Confirm before removing** - list what will be removed and let user confirm it
- [ ] **Add "add" command** `workspace-manager add <repo> [path] [--branch main] [--go]` to simplify adding new repos
- [x] **Add "enable" command** to re-enable disabled repositories in workspace configuration
- [x] **Add "disable" command** to disable active repositories in workspace configuration
- [x] **Prompt for sync after enable/disable** - ask user if they want to sync after modifying workspace.yml, default to No unless `-y` is passed

### Medium Priority

- [ ] **Improve git error reporting** by capturing stderr for better debugging instead of suppressing with `stderr: "null"`
- [ ] **Fix path handling** using proper path joining methods instead of string concatenation
- [ ] **Add input validation** for workspace URLs and paths to prevent invalid configurations
- [x] **Handle dirty workspace** - use stash if possible to preserve uncommitted changes
- [x] **Batch processing for "sync" command** - multiple modules at a time
- [x] **Batch processing for "update" command** - multiple modules at a time

### Low Priority

- [ ] **Consider adding transaction-like behavior** to rollback changes if any step fails during sync
- [x] **Complete Go workspace path resolution** - fix TODO comments about prepending `goWorkRoot` to paths
- [ ] **Implement status command** to show current workspace state
- [ ] **Add confirmation prompts** for destructive operations when `--yes` is not specified
- [x] **Add emoji to output** to make it more eye-catching
- [ ] **Add spinner for long-running actions** to improve user experience
- [x] **Add install instruction using `deno install from jsdelivr`** for easier distribution
- [ ] **Auto-generate .env file from template** to maintain a single .env file and distribute it across submodules

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

