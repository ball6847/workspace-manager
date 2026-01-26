# Post-Sync Hooks

> ⚠️ **This is a planned feature** - not yet implemented.

Workspace Manager will support post-sync hooks to execute custom commands after synchronization operations. This enables automation of follow-up tasks like vendoring dependencies, copying configuration files, or triggering other workspace-related operations.

---

## Overview

Post-sync hooks allow you to define custom commands that run automatically after the `sync` command completes. This is useful for:

- Vendoring Go dependencies across the workspace
- Distributing configuration files (VSCode settings, AGENTS.md, etc.) to individual workspaces
- Running workspace-specific setup scripts
- Triggering build or deployment processes

---

## Hook Types

### Global Post-Sync Hook

A global hook runs **once** after **all workspaces** have been synchronized. This is ideal for operations that depend on the entire workspace being up-to-date.

**Use Case Example - Go Workspace Vendor:**

After syncing all Go modules, automatically vendor dependencies across the entire workspace:

```yaml
hooks:
  postSync:
    global:
      - command: "go"
        args: ["work", "vendor"]
        description: "Vendor all Go workspace dependencies"
        workingDir: "{workspaceRoot}"
```

**Why global hooks run after all syncs:**
- Prevents race conditions where a newly synced module might be missed
- Ensures `go work vendor` sees all modules before vendoring
- Single execution is more efficient than running per-workspace

---

### Workspace-Specific Post-Sync Hook

A workspace-specific hook runs **after each individual workspace** has been synchronized and after global hooks complete. This is useful for per-repository operations.

**Use Case Example - Development Environment Setup:**

After syncing a specific workspace, automatically configure development tools:

```yaml
workspaces:
  - url: git@github.com:user/go-service.git
    path: services/go-service
    branch: main
    isGolang: true
    active: true
    postSync:
      - command: "cp"
        args: ["{workspaceRoot}/.vscode/settings.json", "{workspacePath}/.vscode/settings.json"]
        description: "Copy VSCode settings to workspace"
      - command: "cp"
        args: ["{workspaceRoot}/AGENTS.md", "{workspacePath}/AGENTS.md"]
        description: "Copy AGENTS.md documentation to workspace"
```

---

## Configuration Reference

### Full Hook Configuration Structure

```yaml
hooks:
  postSync:
    global:
      - command: "<executable>"
        args: ["<arg1>", "<arg2>"]
        description: "<human-readable description>"
        workingDir: "<path>"  # Optional: defaults to workspace root
        env:                  # Optional: environment variables
          VAR_NAME: "value"

    workspaces:
      <workspace-path>:
        - command: "<executable>"
          args: ["<arg1>"]
          description: "<description>"
          workingDir: "<path>"  # Optional
          env:                  # Optional
            VAR_NAME: "value"
```

### Configuration Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `command` | string | Yes | The executable to run (e.g., `go`, `cp`, `npm`) |
| `args` | array of strings | Yes | Arguments passed to the command |
| `description` | string | No | Human-readable description for logging |
| `workingDir` | string | No | Working directory for the command (supports variables) |
| `env` | object | No | Environment variables to set for the command |

---

## Hook Variables

Hooks support variables that are substituted at runtime. Variables use curly brace syntax:

| Variable | Description | Example Value |
|----------|-------------|---------------|
| `{workspaceRoot}` | Root directory of the workspace (where workspace.yml resides) | `/home/user/my-workspace` |
| `{workspacePath}` | Path to the specific workspace repository | `/home/user/my-workspace/services/api` |
| `{workspaceUrl}` | Git URL of the workspace repository | `git@github.com:user/repo.git` |
| `{workspaceBranch}` | Configured branch for the workspace | `main` |

**Example with variables:**

```yaml
hooks:
  postSync:
    global:
      - command: "go"
        args: ["work", "vendor"]
        description: "Vendor dependencies"
        workingDir: "{workspaceRoot}"
```

---

## Execution Order

The hooks execute in a specific order to ensure consistency and prevent race conditions:

1. **Sync Phase**
   - All workspaces are synchronized (concurrently or sequentially based on `--concurrency` setting)

2. **Global Hooks**
   - After all syncs complete, global post-sync hooks execute **once**
   - All global hooks run sequentially in defined order

3. **Workspace Hooks**
   - After global hooks complete, workspace-specific hooks execute for each workspace
   - Workspace hooks run sequentially, not concurrently

```
┌─────────────────────────────────────────────────────────────┐
│                    sync command                             │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                     │
│  │ sync ws1│  │ sync ws2│  │ sync ws3│  ... (concurrent)  │
│  └────┬────┘  └────┬────┘  └────┬────┘                     │
│       │            │            │                           │
│       └────────────┴────────────┘                           │
│                    │                                         │
│                    ▼                                         │
│         ┌─────────────────────┐                              │
│         │  Global Hooks Run   │  ← run once after all syncs │
│         │   (sequential)      │                              │
│         └──────────┬──────────┘                              │
│                    │                                         │
│                    ▼                                         │
│         ┌─────────────────────┐                              │
│         │ Workspace Hooks Run │  ← per workspace             │
│         │   (sequential)      │                              │
│         └─────────────────────┘                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Error Handling

### Hook Failure Behavior

| Scenario | Behavior |
|----------|----------|
| Global hook fails | Subsequent global hooks are skipped, workspace hooks do not run |
| Workspace hook fails | Subsequent hooks for that workspace are skipped, other workspaces continue |
| Command not found | Hook fails, logged as error |
| Permission denied | Hook fails, logged as error |

### Error Logging

Failed hooks are logged with:
- Workspace path (if applicable)
- Command that failed
- Exit code (if available)
- stderr output (if available)

---

## Example Configurations

### Example 1: Go Workspace with Vendor

```yaml
# workspace.yml
hooks:
  postSync:
    global:
      - command: "go"
        args: ["work", "vendor"]
        description: "Vendor Go workspace dependencies"

workspaces:
  - url: git@github.com:user/auth-service.git
    path: services/auth
    branch: main
    isGolang: true
    active: true

  - url: git@github.com:user/api-gateway.git
    path: services/api
    branch: develop
    isGolang: true
    active: true
```

### Example 2: Development Environment Distribution

```yaml
# workspace.yml
hooks:
  postSync:
    global:
      - command: "go"
        args: ["work", "vendor"]
        description: "Vendor Go dependencies"

    workspaces:
      services/auth:
        - command: "cp"
          args: ["{workspaceRoot}/.vscode/settings.json", "{workspacePath}/.vscode/settings.json"]
          description: "Copy VSCode settings"
        - command: "cp"
          args: ["{workspaceRoot}/AGENTS.md", "{workspacePath}/AGENTS.md"]
          description: "Copy AGENTS.md documentation"

      services/api:
        - command: "cp"
          args: ["{workspaceRoot}/.vscode/settings.json", "{workspacePath}/.vscode/settings.json"]
          description: "Copy VSCode settings"
        - command: "cp"
          args: ["{workspaceRoot}/.env.template", "{workspacePath}/.env"]
          description: "Copy environment template"

workspaces:
  - url: git@github.com:user/auth-service.git
    path: services/auth
    branch: main
    isGolang: true
    active: true

  - url: git@github.com:user/api-gateway.git
    path: services/api
    branch: develop
    isGolang: true
    active: true
```

### Example 3: Custom Script Hook

```yaml
# workspace.yml
hooks:
  postSync:
    global:
      - command: "bash"
        args: ["{workspaceRoot}/scripts/post-sync-global.sh"]
        description: "Run global post-sync script"
        env:
          SYNC_MODE: "global"
          LOG_LEVEL: "info"

    workspaces:
      services/app:
        - command: "bash"
          args: ["{workspaceRoot}/scripts/post-sync-workspace.sh"]
          description: "Run workspace-specific post-sync"
          workingDir: "{workspacePath}"
          env:
            WORKSPACE_NAME: "app"

workspaces:
  - url: git@github.com:user/app.git
    path: services/app
    branch: main
    active: true
```

---

## Security Considerations

1. **Command Whitelisting** (future enhancement)
   - Only approved commands may be executed
   - Prevents accidental or malicious command execution

2. **Path Validation**
   - Working directories are validated to be within the workspace
   - Prevents path traversal attacks

3. **Environment Isolation**
   - Hooks inherit the system environment by default
   - Explicit env vars can be set for additional control

---

## Implementation Roadmap

### Phase 1: Basic Hook Support
- [ ] Add hook configuration parsing
- [ ] Implement global hook execution after sync
- [ ] Add variable substitution ({workspaceRoot}, {workspacePath})
- [ ] Basic error handling and logging

### Phase 2: Workspace-Specific Hooks
- [ ] Add per-workspace hook configuration
- [ ] Implement sequential workspace hook execution
- [ ] Add workingDir support per hook
- [ ] Environment variable support

### Phase 3: Enhancements
- [ ] Command whitelisting for security
- [ ] Hook timeout configuration
- [ ] Conditional hook execution (based on sync results)
- [ ] Pre-sync hooks support