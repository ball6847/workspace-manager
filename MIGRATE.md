# Workspace Manager - Directory Structure Migration Plan

## Overview

This document outlines the plan to move the `cmds/` and `libs/` directories to a `src/` directory to better organize the project structure.

## Current Structure

```
workspace-manager/
├── main.ts
├── cmds/ (6 files)
│   ├── add.ts
│   ├── disable.ts
│   ├── enable.ts
│   ├── save.ts
│   ├── sync.ts
│   └── update.ts
├── libs/ (6 files)
│   ├── config.ts
│   ├── concurrent.ts
│   ├── errors.ts
│   ├── file.ts
│   ├── git.ts
│   └── go.ts
├── example/
├── deno.json
└── README.md
```

## Target Structure

```
workspace-manager/
├── main.ts
├── src/
│   ├── cmds/ (6 files)
│   │   ├── add.ts
│   │   ├── disable.ts
│   │   ├── enable.ts
│   │   ├── save.ts
│   │   ├── sync.ts
│   │   └── update.ts
│   └── libs/ (6 files)
│       ├── config.ts
│       ├── concurrent.ts
│       ├── errors.ts
│       ├── file.ts
│       ├── git.ts
│       └── go.ts
├── example/
├── docs/
├── deno.json
└── README.md
```

## Required Changes

### 1. File Movement (12 files total)

**Move all 6 files from `cmds/` → `src/cmds/`:**
- `cmds/add.ts` → `src/cmds/add.ts`
- `cmds/disable.ts` → `src/cmds/disable.ts`
- `cmds/enable.ts` → `src/cmds/enable.ts`
- `cmds/save.ts` → `src/cmds/save.ts`
- `cmds/sync.ts` → `src/cmds/sync.ts`
- `cmds/update.ts` → `src/cmds/update.ts`

**Move all 6 files from `libs/` → `src/libs/`:**
- `libs/config.ts` → `src/libs/config.ts`
- `libs/concurrent.ts` → `src/libs/concurrent.ts`
- `libs/errors.ts` → `src/libs/errors.ts`
- `libs/file.ts` → `src/libs/file.ts`
- `libs/git.ts` → `src/libs/git.ts`
- `libs/go.ts` → `src/libs/go.ts`

### 2. Import Updates

**main.ts - Update 6 imports:**
```typescript
// Current:
import { addCommand } from "./cmds/add.ts";
import { enableCommand } from "./cmds/enable.ts";
import { saveCommand } from "./cmds/save.ts";
import { statusCommand } from "./cmds/status.ts";
import { syncCommand } from "./cmds/sync.ts";
import { updateCommand } from "./cmds/update.ts";

// Should become:
import { addCommand } from "./src/cmds/add.ts";
import { enableCommand } from "./src/cmds/enable.ts";
import { saveCommand } from "./src/cmds/save.ts";
import { statusCommand } from "./src/cmds/status.ts";
import { syncCommand } from "./src/cmds/sync.ts";
import { updateCommand } from "./src/cmds/update.ts";
```

**All files in cmds/ - Update 25 imports:**
```typescript
// Current pattern in all cmds/*.ts files:
import { ... } from "../libs/...";

// Should become:
import { ... } from "../src/libs/...";
```

### 3. Documentation Updates

**AGENTS.md:**
- Update project structure documentation section
- Update file path references in examples

**README.md:**
- Update project structure documentation section
- Update file path references in examples

## Benefits

1. **Cleaner root directory**: Main.ts, docs, examples, and configuration files at root level
2. **Standard convention**: `src/` is the conventional directory for source code
3. **Better organization**: Separates source code from project metadata
4. **Future-proofing**: Easier to add tests, types, or other directories later

## Migration Steps

1. **Create target directory structure:**
   ```bash
   mkdir -p src/cmds src/libs
   ```

2. **Move files:**
   ```bash
   # Move cmds/
   mv cmds/*.ts src/cmds/
   
   # Move libs/
   mv libs/*.ts src/libs/
   ```

3. **Update imports:**
   - Update 6 imports in `main.ts` (from `./cmds/` → `./src/cmds/`)
   - Update 25 imports across all `cmds/*.ts` files (from `../libs/` → `../src/libs/`)

4. **Update documentation:**
   - Update AGENTS.md project structure section
   - Update README.md project structure section

5. **Test:**
   ```bash
   # Test build
   deno task build
   
   # Test functionality
   deno run --allow-all main.ts --help
   ```

## Files That Would NOT Need Updates

1. **All files in libs/** - No internal imports
2. **deno.json** - Configuration doesn't reference cmds/libs paths directly
3. **example/workspace.yml** - Configuration file, no code references
4. **GitHub workflows** - No references to directory structure
5. **.vscode/settings.json** - Editor configuration, no path references

## Risk Assessment

**Low Risk Migration:**
- No circular dependencies
- Clear import patterns that can be systematically updated
- Standard TypeScript/Deno project structure
- All changes are localized to import statements
- Build system remains unchanged

## Verification

After migration, verify:
1. `deno task build` completes successfully
2. All commands work: `deno run --allow-all main.ts [command] --help`
3. Import paths resolve correctly
4. TypeScript compilation succeeds
5. Documentation reflects new structure