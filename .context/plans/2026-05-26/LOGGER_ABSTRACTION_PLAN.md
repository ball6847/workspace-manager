---
createdAt: "2026-05-26T10:30:00Z"
implementedAt: "2026-05-26T11:15:00Z"
reviewedAt: null
---

# Plan: Logger Abstraction for Cleaner Test Output

## Overview

Replace direct `console.log` calls in `sync.ts` with a logger abstraction to eliminate noisy test output. This enables tests to use `SilentLogger` or `BufferLogger` while CLI usage maintains colored console output. Logger is required (no fallback to console) and injected per-command.

## Target Structure

```
src/
├── libs/
│   └── logger.ts          [NEW: Logger interface + implementations]
└── cmds/
    └── sync.ts           [MODIFY: Use logger parameter]
    
tests/
└── sync/
    └── sync_command_test.ts  [MODIFY: Use SilentLogger]
```

## Files to Create

### 1. `src/libs/logger.ts`

**Purpose:** Logger interface and implementations for different contexts

**Interface:**
```typescript
export interface Logger {
    log(message: string): void;
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
}
```

**Implementations:**
- `ConsoleLogger`: Writes to stdout (log/info) and stderr (warn/error). Follow existing color patterns from `@std/fmt/colors`
- `SilentLogger`: No-op implementation for tests
- `BufferLogger`: Captures all output in a string array for test assertions. Add `getOutput(): string[]` and `clear(): void` methods

**Constraints:**
- No default export (use named exports)
- Match existing code style (early-return, Result types where applicable)
- No dependencies on external packages beyond what's already in project

## Files to Modify

### 1. `src/cmds/sync.ts`

**Changes:**
- Import `Logger` from `../libs/logger.ts`
- Add `logger: Logger` parameter to `syncSingleWorkspace()` function (required, no default value)
- Replace ALL `console.log` calls with appropriate logger methods:
  - `console.log(green(...))` → `logger.info(...)`
  - `console.log(yellow(...))` → `logger.warn(...)`
  - `console.log(red(...))` → `logger.error(...)`
  - Plain `console.log(...)` → `logger.log(...)`
- Pass logger through to `processHookResult()` and `processGlobalHookResult()` helper functions

**Functions to update:**
- `syncSingleWorkspace()` - signature change + all console calls
- `processHookResult()` - add logger parameter
- `processGlobalHookResult()` - add logger parameter

**Pattern:** Follow existing early-return pattern. No functional changes, only output routing.

### 2. `src/cli.ts`

**Changes:**
- Import `ConsoleLogger` from `../libs/logger.ts`
- In sync command action: create `new ConsoleLogger()` and pass to `syncCommand()`
- Update `syncCommand()` signature to accept `logger: Logger` parameter
- Pass logger to `syncSingleWorkspace()` calls

### 3. `tests/sync/sync_command_test.ts`

**Changes:**
- Import `SilentLogger` from `../../src/libs/logger.ts`
- Update all test cases calling `syncSingleWorkspace()` to pass `new SilentLogger()` as the logger parameter
- For any tests needing to verify output: use `BufferLogger` and assert on `getOutput()`

**Test updates needed:**
- TC-SYNC-001 through TC-SYNC-013 (all tests calling syncSingleWorkspace)

## Test Cases

### TC-LOG-001: Logger interface implementations

**Priority:** P0
**Type:** Functional

#### Objective
Verify all logger implementations work correctly

#### Preconditions
- Logger module imported

#### Test Steps
1. Create ConsoleLogger and call each method
   **Expected:** Output appears in correct stream (stdout for log/info, stderr for warn/error)
2. Create SilentLogger and call each method
   **Expected:** No output, no errors
3. Create BufferLogger, call methods, then check output
   **Expected:** `getOutput()` returns all messages in order, `clear()` empties buffer

#### Post-conditions
- All logger implementations are functional

### TC-LOG-002: syncSingleWorkspace requires logger

**Priority:** P0
**Type:** Functional

#### Objective
Verify logger parameter is required and used

#### Preconditions
- Valid workspace configuration

#### Test Steps
1. Call `syncSingleWorkspace()` without logger parameter
   **Expected:** TypeScript compilation error
2. Call with `SilentLogger`
   **Expected:** No console output during execution
3. Call with `BufferLogger` and verify messages captured
   **Expected:** Output contains expected log messages

#### Post-conditions
- Logger is properly integrated

### TC-LOG-003: CLI passes logger to sync command

**Priority:** P0
**Type:** Integration

#### Objective
Verify CLI integration works with logger

#### Preconditions
- CLI initialized

#### Test Steps
1. Run sync command via CLI
   **Expected:** Colored output appears in console (stdout/stderr as appropriate)
2. Run sync command with invalid workspace
   **Expected:** Error messages appear in stderr via logger

#### Post-conditions
- CLI output unchanged in behavior, just routed through logger

## Verification Commands

```bash
# Type check
denon task check

# Format check
denon task fmt:check

# Run all tests (should have clean output)
denon task test

# Run sync tests specifically
denon task test:sync
```

## Expected Outcome

- All 27 tests pass (14 git + 13 sync)
- Test output is clean (no unexpected console logs)
- CLI output remains the same (colored, informative)
- No breaking changes to existing functionality
- TypeScript compilation succeeds
- Code formatting passes

## Rollback Plan

If issues arise:
1. Revert `src/libs/logger.ts` (delete file)
2. Revert all changes to `src/cmds/sync.ts` (remove logger parameter, restore console calls)
3. Revert changes to `src/cli.ts` (remove logger import and usage)
4. Revert test file changes

All changes are isolated to these files, so rollback is straightforward via git.

## Diagrams

### Sequence Diagram

```
CLI          sync.ts          logger.ts
  |              |                |
  |--- create ConsoleLogger -->|
  |              |                |
  |--- syncCommand(logger) -->|
  |              |                |
  |              |--- syncSingleWorkspace(..., logger) -->|
  |              |                |                |
  |              |                |--- logger.info() -->|
  |              |                |--- logger.error() -->|
  |              |                |                |
  |<-- Result <--|                |
  |              |                |
```

### Component Diagram

```
┌─────────────┐     ┌─────────────┐
│   CLI (cli.ts)│────>│ sync.ts     │
└─────────────┘     └────────┬────┘
                              │
                              v
                     ┌─────────────────┐
                     │ Logger Interface │
                     ├─────────────────┤
                     │ + log()          │
                     │ + info()         │
                     │ + warn()         │
                     │ + error()        │
                     └────────┬────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        v                     v                     v
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ ConsoleLogger│    │ SilentLogger │    │ BufferLogger │
└──────────────┘    └──────────────┘    └──────────────┘
```
