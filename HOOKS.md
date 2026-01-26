# Post-Sync Hooks

> ⚠️ **This is a planned feature** - not yet implemented.

Workspace Manager supports post-sync hooks to execute custom commands after synchronization. Complex automation should be delegated to shell scripts.

---

## Overview

Hooks run after the `sync` command completes. Use them for:
- Running workspace-wide operations (e.g., `go work vendor`)
- Executing per-workspace commands (e.g., copying config files)
- Triggering build or setup scripts

For complex logic, create a shell script and call it from the hook.

---

## Configuration

### Global Hooks

Defined in `workspace.yml` under `hooks.postSyncHooks`. Run once after all workspaces sync.

```yaml
hooks:
  postSyncHooks:
    - cmd: ["go", "work", "vendor"]
      description: "Vendor Go dependencies"
      workDir: "{root}"
      timeout: 120000
```

### Workspace-Specific Hooks

Defined per workspace in `workspaces[].postSyncHooks`. Run after that workspace syncs.

```yaml
workspaces:
  - url: git@github.com:user/go-service.git
    path: services/go-service
    branch: main
    isGolang: true
    active: true
    postSyncHooks:
      - cmd: ["npm", "run", "build"]
        description: "Build service"
        workDir: "{path}"
        timeout: 300000
      - cmd: ["cp", "{root}/.vscode/settings.json", "{path}/.vscode/"]
        description: "Copy VSCode settings"
```

## Execution Order

1. All workspaces sync (concurrent)
2. Global hooks run once sequentially
3. Workspace hooks run per workspace (in order)

## Execution Rules

| Command Uses | Runs |
|--------------|------|
| No `{path}` variable | Once globally after all syncs |
| Uses `{path}` variable | For each workspace |

**Example:**
```yaml
hooks:
  postSyncHooks:
    # Global: runs once
    - cmd: ["go", "work", "vendor"]

    # Per-workspace: runs for each workspace
    - cmd: ["cp", "{root}/.vscode/settings.json", "{path}/.vscode/"]
```

---

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `cmd` | array | **required** | Command and arguments |
| `description` | string | `""` | Human-readable description |
| `workDir` | string | `{root}` | Working directory |
| `timeout` | number | `60000` | Max execution time (ms) |
| `env` | object | `{}` | Environment variables |

---

## Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `{root}` | Workspace root directory | `/home/user/workspace` |
| `{path}` | Per-workspace directory | `/home/user/workspace/services/api` |

---

## Examples

### Go Workspace Vendor

```yaml
hooks:
  postSyncHooks:
    - cmd: ["go", "work", "vendor"]
      description: "Vendor Go workspace dependencies"
      workDir: "{root}"
```

### Development Environment Setup

```yaml
hooks:
  postSyncHooks:
    - cmd: ["cp", "{root}/.vscode/settings.json", "{path}/.vscode/settings.json"]
      description: "Copy VSCode settings"

    - cmd: ["cp", "{root}/AGENTS.md", "{path}/AGENTS.md"]
      description: "Copy AGENTS.md documentation"
```

### Custom Shell Script

```yaml
hooks:
  postSyncHooks:
    - cmd: ["bash", "{root}/scripts/post-sync.sh"]
      description: "Run custom post-sync script"
      workDir: "{root}"
      env:
        SYNC_MODE: "post-sync"
        LOG_LEVEL: "debug"
```

### Docker Build

```yaml
hooks:
  postSyncHooks:
    - cmd: ["docker", "build", "-t", "myapp", "."]
      description: "Build Docker image"
      workDir: "{path}"
      timeout: 300000
```

### Mixed Global and Workspace Hooks

```yaml
hooks:
  postSyncHooks:
    - cmd: ["go", "work", "vendor"]
      description: "Vendor Go dependencies globally"

workspaces:
  - url: git@github.com:user/api.git
    path: services/api
    branch: main
    active: true
    postSyncHooks:
      - cmd: ["npm", "run", "build"]
        description: "Build API service"
        workDir: "{path}"

  - url: git@github.com:user/web.git
    path: services/web
    branch: develop
    active: true
    postSyncHooks:
      - cmd: ["npm", "run", "build"]
        description: "Build web app"
        workDir: "{path}"
      - cmd: ["cp", "{root}/.env.production", "{path}/.env"]
        description: "Copy environment file"
```

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Hook fails | Error logged, subsequent hooks continue |
| Command not found | Error logged |
| Timeout exceeded | Hook terminated, error logged |

---

## Best Practices

1. **Complex logic → Shell script**: Don't overcomplicate hook config. Write a script instead.
2. **Use descriptive descriptions**: Helps with debugging and logging.
3. **Set appropriate timeouts**: Long-running commands need higher timeouts.
4. **Use `{root}` for global commands**: Avoids per-workspace duplication.

---

## Implementation Roadmap

- [ ] Add global hook configuration parsing
- [ ] Implement global hook execution after sync
- [ ] Add variable substitution (`{root}`, `{path}`)
- [ ] Add workspace-specific hook parsing
- [ ] Implement workspace hook execution
- [ ] Add working directory and timeout support
- [ ] Environment variable support
