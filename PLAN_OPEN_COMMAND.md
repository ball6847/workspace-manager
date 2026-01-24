# Plan: Open Command for Workspace Manager

## Overview
Add a new command `open` (alias `o`) to open workspace submodules in a configured editor. This command is **interactive** - it presents a searchable dropdown list of workspaces from `workspace.yml` using Cliffy's `Select.prompt()` and opens the selected repository in the configured editor.

## Requirements Analysis

### Core Requirements
1. **New Command**: `open` (alias `o`)
2. **Interactive Selection**: Use Cliffy's `Select.prompt()` to list and search workspaces
3. **No File Path Argument**: User selects from configured workspaces via dropdown
4. **Configuration**: Editor command configurable in `workspace.yml`
5. **Fallback**: Use `$EDITOR` environment variable if not configured
6. **Support**: Works with any editor (vim, nvim, code, etc.)

### Usage Examples
```bash
# Interactive: shows dropdown of workspaces, opens selected
workspace-manager open

# With alias
workspace-manager o

# Use config from custom location
workspace-manager open -c custom-workspace.yml

# Specify workspace root
workspace-manager open -w /path/to/root

# Debug mode to see what's happening
workspace-manager open -d
```

### Interactive UI Example
```
$ workspace-manager open

? Select workspace to open:
  › ○ services/api (main)
    ○ modules/auth (develop)
    ○ deployments/k8s-config (stable)
    ◉ microservices/auth (production)  [active]

  Type to search... (↑↓ to navigate, Enter to select, Ctrl+C to cancel)
```

## Technical Implementation Plan

### 1. Update Configuration Schema

**File**: `src/libs/config.ts`

Add new configuration option at root level:

```typescript
export type WorkspaceConfigItem = {
  url: string;
  path: string;
  branch: string;
  isGolang: boolean;
  active: boolean;
};

export type WorkspaceConfig = {
  workspaces: WorkspaceConfigItem[];
  // NEW: Global editor setting
  editor?: string;
};
```

**Updated `workspace.yml` example**:
```yaml
# Editor configuration (optional)
# Global editor for all workspaces. Can be overridden per workspace.
# Falls back to $EDITOR environment variable if not set.
editor: "nvim"

workspaces:
  - url: 'git@github.com:org/repo1.git'
    path: services/api
    branch: main
    isGolang: true
    active: true
```

### 2. Create Open Command Implementation

**File**: `src/cmds/open.ts`

```typescript
import * as path from "@std/path";
import { Result } from "typescript-result";
import { Select } from "@cliffy/prompt";
import { parseConfigFile } from "../libs/config.ts";
import { isDir } from "../libs/file.ts";
import { ErrorWithCause } from "../libs/errors.ts";
import { blue, gray, red } from "@std/fmt/colors";

export type OpenCommandOption = {
  /**
   * Path to workspace config file, default is workspace.yml
   */
  config?: string;
  /**
   * Path to workspace root directory, default is current directory
   */
  workspaceRoot?: string;
  /**
   * If true, print debug information
   */
  debug?: boolean;
};

type WorkspaceSelection = {
  path: string;
  url: string;
  branch: string;
  isActive: boolean;
  isGolang: boolean;
  directory: string;
};

/**
 * Open workspace submodule in configured editor via interactive selection
 */
export async function openCommand(option: OpenCommandOption): Promise<Result<void, Error>> {
  // Handle defaults
  const configFile = option.config ?? "workspace.yml";
  const workspaceRoot = option.workspaceRoot ?? ".";
  const debug = option.debug ?? false;

  // Parse config
  const parseConfig = await parseConfigFile(configFile);
  if (!parseConfig.ok) {
    return Result.error(parseConfig.error);
  }
  const config = parseConfig.value;

  // Build workspace selection list
  const workspaces = await buildWorkspaceList(config, workspaceRoot, debug);

  if (workspaces.length === 0) {
    return Result.error(new Error("No workspaces found in configuration"));
  }

  // Check editor
  const editor = resolveEditor(config);
  if (!editor) {
    return Result.error(
      new Error(
        "No editor configured. Set 'editor' in workspace.yml or $EDITOR environment variable",
      ),
    );
  }

  if (debug) {
    console.log(blue(`Using editor: ${editor}`));
  }

  // Present interactive selection
  const selected = await presentWorkspaceSelector(workspaces);
  if (!selected) {
    // User cancelled
    return Result.ok();
  }

  if (debug) {
    console.log(blue(`Selected workspace: ${selected.path}`));
  }

  // Open selected workspace in editor
  return openInEditor(selected.directory, editor, debug);
}

async function buildWorkspaceList(
  config: WorkspaceConfig,
  workspaceRoot: string,
  debug: boolean,
): Promise<WorkspaceSelection[]> {
  const result: WorkspaceSelection[] = [];

  for (const workspace of config.workspaces) {
    const workspaceDir = path.join(workspaceRoot, workspace.path);

    // Check if directory exists
    const exists = await isDir(workspaceDir);
    const dirExists = exists.ok;

    // Build display string with status indicators
    const statusParts: string[] = [];

    if (!workspace.active) {
      statusParts.push("disabled");
    }

    if (!dirExists) {
      statusParts.push("not found");
    }

    const status = statusParts.length > 0 ? ` (${statusParts.join(", ")})` : "";

    result.push({
      path: workspace.path,
      url: workspace.url,
      branch: workspace.branch,
      isActive: workspace.active,
      isGolang: workspace.isGolang,
      directory: workspaceDir,
      // Store display name for selector
      // @ts-ignore - custom field
      displayName: `${workspace.active ? "◉" : "○"} ${workspace.path} (${workspace.branch})${status}`,
    });
  }

  return result;
}

async function presentWorkspaceSelector(
  workspaces: WorkspaceSelection[],
): Promise<WorkspaceSelection | null> {
  // Build options for Select prompt
  const options = workspaces.map((w) => {
    const displayName = (w as WorkspaceSelection & { displayName: string }).displayName;
    return {
      name: displayName,
      value: w.path,
    };
  });

  // Add cancel option
  options.push({
    name: "Cancel",
    value: "cancel",
  });

  try {
    const selected = await Select.prompt({
      message: "Select workspace to open:",
      options: options,
      search: true, // Enable type-to-search
      cursorStyle: "block",
    });

    if (selected === "cancel") {
      return null;
    }

    // Find selected workspace
    const workspace = workspaces.find((w) => w.path === selected);
    return workspace ?? null;
  } catch {
    // User cancelled with Ctrl+C
    return null;
  }
}

function resolveEditor(config: WorkspaceConfig): string | null {
  // 1. Check global editor in config
  if (config.editor && config.editor.trim().length > 0) {
    return config.editor;
  }

  // 2. Fallback to environment variable
  const envEditor = Deno.env.get("EDITOR");
  if (envEditor && envEditor.trim().length > 0) {
    return envEditor;
  }

  // 3. Check VISUAL as secondary fallback
  const visualEditor = Deno.env.get("VISUAL");
  if (visualEditor && visualEditor.trim().length > 0) {
    return visualEditor;
  }

  return null;
}

async function openInEditor(dir: string, editor: string, debug: boolean): Promise<Result<void, Error>> {
  return await Result.fromAsyncCatching(async () => {
    // Parse editor command (support spaces in command path)
    const parts = editor.split(" ").filter((p) => p.length > 0);
    const editorCmd = parts[0];
    const args = parts.slice(1);

    if (debug) {
      console.log(blue(`Opening ${dir} with: ${editor}`));
    }

    // Spawn editor - use inherit for stdin/stdout/stderr to make it interactive
    const command = new Deno.Command(editorCmd, {
      args: [...args, dir],
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });

    const child = command.spawn();
    const status = await child.status;

    if (!status.success) {
      throw new Error(`Editor exited with code ${status.code}`);
    }
  }).mapError((error) => new ErrorWithCause(`Failed to open editor for ${dir}`, error));
}
```

### 3. Register Command in CLI

**File**: `src/cli.ts`

Add after status command:

```typescript
import { openCommand } from "./cmds/open.ts";

// ... existing imports

// Open command
cli
  .command("open", "Open workspace submodule in configured editor via interactive selection")
  .alias("o")
  .option("-c, --config <config:string>", "Workspace config file", {
    default: "workspace.yml",
  })
  .option("-w, --workspace-root <workspace-root:string>", "Workspace root", {
    default: ".",
  })
  .option("-d, --debug", "Enable debug mode", { default: false })
  .action(async (options) => {
    const result = await openCommand({
      config: options.config,
      workspaceRoot: options.workspaceRoot,
      debug: options.debug,
    });
    if (!result.ok) {
      console.log(red("❌ Open failed:"), result.error.message);
      Deno.exit(1);
    }
  });
```

### 4. Update Example Configuration

**File**: `example/workspace.yml`

Add editor at root level (at the very top of the file):

```yaml
editor: "nvim"

workspaces:
  # ... existing entries
```

## Implementation Tasks

### Phase 1: Configuration Updates
- [ ] Task 1: Update `WorkspaceConfigItem` type in `src/libs/config.ts`
- [ ] Task 2: Add `editor` to config example file
- [ ] Task 3: Run lint/check to verify type changes

### Phase 2: Command Implementation
- [ ] Task 4: Create `src/cmds/open.ts` with openCommand function
- [ ] Task 5: Import `@cliffy/prompt` for Select.prompt()
- [ ] Task 6: Implement buildWorkspaceList() for building selection options
- [ ] Task 7: Implement presentWorkspaceSelector() with search-enabled Select
- [ ] Task 8: Implement editor resolution logic (config > $EDITOR > $VISUAL)
- [ ] Task 9: Implement subprocess spawning for editor

### Phase 3: CLI Integration
- [ ] Task 10: Import open command in `src/cli.ts`
- [ ] Task 11: Register open command with Cliffy (no positional args)
- [ ] Task 12: Add alias "o" for the command

### Phase 4: Testing & Documentation
- [ ] Task 13: Test with nvim/vim
- [ ] Task 14: Test with VS Code (code command)
- [ ] Task 15: Test fallback to $EDITOR
- [ ] Task 16: Test search functionality in dropdown
- [ ] Task 17: Test cancel behavior (Ctrl+C)
- [ ] Task 18: Update README.md with open command documentation

## Editor Spawning Details

### How Deno.Command Works with Interactive Editors

```typescript
// Key configuration for interactive editors:
const command = new Deno.Command(editorCmd, {
  args: [directoryPath],
  stdin: "inherit",   // Connect terminal stdin to editor
  stdout: "inherit",  // Connect terminal stdout to editor
  stderr: "inherit",  // Connect terminal stderr to editor
});

// Spawn and wait for completion
const child = command.spawn();
const status = await child.status;  // Blocks until editor closes
```

### Why This Works
1. `stdin: "inherit"` - The editor receives keyboard input from the terminal
2. `stdout: "inherit"` - Editor output displays in terminal
3. `await child.status` - Blocks until user closes the editor
4. The terminal remains interactive throughout

### Supported Editors
| Editor | Command | Notes |
|--------|---------|-------|
| Neovim | `nvim` | Works perfectly |
| Vim | `vim` | Works perfectly |
| VS Code | `code` | Use `code -w` for waiting |
| Helix | `hx` | Works perfectly |
| Emacs | `emacs` | May need terminal mode |

### Editor-Specific Notes
- **VS Code**: Use `code -w` flag to wait until window closes
  - Config: `editor: "code -w"`
- **Sublime**: Use `subl --wait`
- **IntelliJ**: Use `idea` (waits by default)

## Cliffy Select.prompt() Features

The `@cliffy/prompt` library provides:
- **Search/Filter**: User can type to filter the list
- **Keyboard Navigation**: Arrow keys, Ctrl+N/P for next/prev
- **Cursor Styles**: block, underline, line
- **Cancel Support**: Ctrl+C or Escape cancels
- **Mouse Support**: Click to select

```typescript
const selected = await Select.prompt({
  message: "Select workspace to open:",
  options: [
    { name: "Option 1", value: "opt1" },
    { name: "Option 2", value: "opt2" },
  ],
  search: true,  // Enable incremental search
  cursorStyle: "block",
});
```

## Display Format

Workspaces will be displayed with:
- **○** - Disabled workspace
- **◉** - Active workspace
- **Branch name** in parentheses
- **Status indicators** for missing directories

Example:
```
  ○ services/api (main)
  ◉ modules/auth (develop) (disabled)
  ○ deployments/k8s-config (stable) (not found)
```

## Risk Assessment

### Low Risk Items
- Configuration schema update (minimal, backward compatible)
- Editor resolution logic (simple string operations)
- CLI registration (follows existing patterns)

### Medium Risk Items
- Interactive Select.prompt (needs testing)
- Subprocess spawning (needs testing with different editors)

### Mitigation
- Test interactive selection flow
- Test with at least 2 different editors (nvim + code)
- Add debug mode output for troubleshooting
- Test cancel behavior

## Success Criteria

1. Command registers successfully: `workspace-manager open --help`
2. Interactive dropdown appears with all workspaces from config
3. Type-to-search works to filter workspaces
4. Opens selected workspace in configured editor
5. Falls back to $EDITOR when not configured
6. Handles Ctrl+C gracefully (exits without error)
7. Shows visual indicators for active/disabled/missing workspaces
8. Debug mode shows editor command being used

## Estimated Effort

- Configuration updates: 10 minutes
- Command implementation (interactive): 45 minutes
- CLI integration: 10 minutes
- Testing: 30 minutes
- Documentation: 15 minutes

**Total: ~1.5 hours**

## Open Questions

1. **Should disabled workspaces be included?**
   - Yes, include all workspaces with visual indicator
   - User can still open disabled workspaces if needed

2. **What if workspace directory doesn't exist?**
   - Show "not found" status indicator
   - Allow selection but show warning
   - Attempt to open anyway (might fail gracefully)

3. **Should workspaces be sorted?**
   - Yes, maintain config order from workspace.yml
   - Or sort alphabetically? → Keep config order for predictability

4. **Should we support multi-select?**
   - Not for v1, single select only
   - Future enhancement if needed