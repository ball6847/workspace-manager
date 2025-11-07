# Workspace Manager - AI Agent Guide

## Project Overview

Workspace Manager is a command-line tool for managing workspaces with Git submodules and Go workspace integration. It provides automated synchronization, updating, and management of multiple Git repositories within a unified workspace structure.

**Key Features:**
- Sync workspace with remote repositories
- Manage Git submodules automatically  
- Go workspace integration with `go.work` file management
- YAML-based configuration
- Concurrent operations with configurable parallelism
- Debug mode support
- Functional error handling without exceptions

## Technology Stack

- **Runtime**: Deno 2.4+ with TypeScript
- **CLI Framework**: Cliffy - https://cliffy.io
- **Error Handling**: typescript-result library - https://www.typescript-result.dev
- **Configuration**: YAML parsing via @std/yaml
- **Package Management**: JSR (JavaScript Registry) and npm hybrid approach

## Architecture & Design Principles

### SOLID Principles
The codebase strictly follows SOLID principles with clean separation of concerns:
- Single Responsibility: Each module has one clear purpose
- Open/Closed: Extensible through configuration and interfaces
- Dependency Inversion: High-level modules don't depend on low-level details

### Code Style Guidelines
- Use `type` instead of `interface` for type definitions
- Use async-await for all asynchronous operations
- Use early-return pattern for control flow
- Use `type` keyword when importing types from other files
- 4-space indentation with tabs
- 120 character line width
- Double quotes for strings
- Format on save enabled in VSCode

## Project Structure

```
/home/ball6847/Projects/personal/workspace-manager/
├── main.ts                    # CLI entry point and command definitions
├── libs/                      # Reusable utility libraries
│   ├── config.ts             # YAML configuration parsing and validation
│   ├── concurrent.ts         # Concurrent processing with batching
│   ├── errors.ts             # Custom error types (ErrorWithCause)
│   ├── file.ts               # File system utilities and validation
│   ├── git.ts                # Git operations (submodules, branches, status)
│   └── go.ts                 # Go workspace management (go.work integration)
├── cmds/                      # CLI command implementations (one per file)
│   ├── add.ts                # Add new repositories to workspace
│   ├── disable.ts            # Disable active workspace repositories
│   ├── enable.ts             # Enable disabled workspace repositories
│   ├── save.ts               # Save current workspace state to config
│   ├── sync.ts               # Sync workspace with remote repositories
│   └── update.ts             # Update submodules to latest branches
├── build/                     # Compiled output directory
│   └── cli.js                # Bundled CLI executable (364KB)
├── example/                   # Example configuration files
│   └── workspace.yml         # Sample workspace configuration
├── deno.json                  # Deno project configuration and tasks
├── deno.lock                  # Dependency lock file
└── .vscode/settings.json      # VSCode Deno integration settings
```

## Configuration

### Workspace Configuration (`workspace.yml`)
```yaml
workspaces:
  - url: 'git@github.com:user/repo.git'
    path: services/my-service
    branch: main
    isGolang: true      # Include in go.work file
    active: true        # Include in sync operations
```

### Deno Configuration (`deno.json`)
- **Tasks**: check, fmt, fmt:check, lint, build, local-install
- **Imports**: JSR packages (@cliffy, @std) + npm packages (typescript-result, zod)
- **Formatter**: 4-space tabs, 120 width, double quotes
- **Linter**: Recommended rules only

## Build & Development Commands

### Development Tasks
```bash
# Format code
deno task fmt

# Check formatting
deno task fmt:check

# Lint code
deno task lint

# Type check
deno task check

# Build bundled executable
deno task build

# Install locally for testing
deno task local-install
```

### Direct Execution
```bash
# Run from source (development)
deno run --allow-all main.ts [command] [options]

# Run compiled version
deno run --allow-all build/cli.js [command] [options]
```

## CLI Commands

### Core Commands
- **sync**: Synchronize workspace with remote repositories
- **update**: Update all submodules to latest tracking branches
- **enable**: Enable disabled workspace repositories
- **disable**: Disable active workspace repositories  
- **add**: Add new repositories to workspace configuration
- **save**: Save current workspace state to configuration file
- **status**: Show workspace status (not implemented)

### Common Options (All Commands)
- `-c, --config <file>`: Workspace config file (default: workspace.yml)
- `-w, --workspace-root <path>`: Workspace root directory (default: .)
- `-d, --debug`: Enable debug mode
- `-j, --concurrency <number>`: Concurrent operations (default: 4)

## Error Handling Strategy

The project uses functional error handling with `typescript-result` instead of try-catch blocks:

```typescript
import { Result } from "typescript-result";

// Wrap operations that might fail
const result = await Result.fromAsyncCatching(() => riskyOperation());

// Chain operations with error propagation
const finalResult = result
  .map(data => transformData(data))
  .mapError(error => new ErrorWithCause("Operation failed", error));

// Handle results
if (!finalResult.ok) {
  console.error("Error:", finalResult.error.message);
  Deno.exit(1);
}
```

### Error Types
- **ErrorWithCause**: Base error class with cause chaining for debugging
- All errors include contextual information and original causes

## Testing Strategy

**Current Status**: No automated tests implemented

**Testing Approach**: Manual testing with example workspace configurations
- Use `example/workspace.yml` for testing various scenarios
- Test with both SSH and HTTPS Git URLs
- Verify Go workspace integration with `go.work` files
- Test concurrent operations with different concurrency levels

## Security Considerations

### Permission Requirements
The CLI requires extensive Deno permissions:
- `--allow-run`: Execute Git and Go commands
- `--allow-write`: Create/modify files and directories
- `--allow-read`: Read configuration and workspace files
- `--allow-env`: Access environment variables
- `--allow-net`: Network access for Git operations

### Security Practices
- Input validation for repository URLs and paths
- Safe Git operations with proper error handling
- No shell injection vulnerabilities (uses Deno.Command)
- Configuration files are read-only after validation

## Deployment Process

### Global Installation
```bash
# Install from CDN (production)
deno install -fr --global --allow-run --allow-write --allow-read --allow-env --allow-net --name workspace-manager https://cdn.jsdelivr.net/gh/ball6847/workspace-manager@v0.0.1-rc9/build/cli.js
```

### Local Development
```bash
# Clone and run locally
git clone <repository-url>
cd workspace-manager
deno run --allow-all main.ts [command]
```

## Development Workflow

### Adding New Commands
1. Create new file in `cmds/` directory
2. Define command options type
3. Implement command function returning `Result<void, Error>`
4. Add command to `main.ts` with proper error handling
5. Update README.md with command documentation

### Adding New Libraries
1. Create file in `libs/` directory
2. Export functions returning `Result` types
3. Use `ErrorWithCause` for error wrapping
4. Follow functional programming patterns
5. Add JSDoc comments for public functions

## Dependencies

### JSR Packages (Preferred)
- `@cliffy/*`: CLI framework components
- `@std/*`: Standard library modules (yaml, path, fmt, text, dotenv)

### NPM Packages (When JSR unavailable)
- `typescript-result`: Functional error handling
- `zod`: Schema validation (imported but not yet implemented)

## Known Limitations

1. **No schema validation**: Zod is imported but not implemented for config validation
2. **No `--yes` option**: Automatic confirmation not implemented
3. **No status command**: Workspace status reporting not implemented
4. **Limited error reporting**: Git stderr suppressed for cleaner output
5. **No transaction support**: No rollback on partial failures

## Future Enhancements

### High Priority
- Add Zod schema validation for workspace configuration
- Implement `--yes` flag for automatic confirmations
- Add confirmation prompts before destructive operations

### Medium Priority
- Improve Git error reporting with stderr capture
- Add input validation for URLs and paths
- Scan for nested `go.mod` files in repositories
- Implement `status` command for workspace overview

### Low Priority
- Add transaction-like behavior for rollback support
- Implement progress spinners for long operations
- Auto-generate `.env` file distribution across submodules