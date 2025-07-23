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

1. **Add schema validation** using Zod (already imported) for the workspace configuration
2. **Implement the `--yes` option** to handle automatic confirmations when removing dirty directories
3. **Standardize error handling** - either use Result pattern consistently or handle errors uniformly

### Medium Priority

4. **Improve git error reporting** by capturing stderr for better debugging instead of suppressing with `stderr: "null"`
5. **Fix path handling** using proper path joining methods instead of string concatenation
6. **Add input validation** for workspace URLs and paths to prevent invalid configurations

### Low Priority

7. **Consider adding transaction-like behavior** to rollback changes if any step fails during sync
8. **Complete Go workspace path resolution** - fix TODO comments about prepending `goWorkRoot` to paths
9. **Implement status command** to show current workspace state
10. **Add confirmation prompts** for destructive operations when `--yes` is not specified

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
