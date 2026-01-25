# Mission: Refactor open.ts to use services like sync.ts

## M1: Extend ConfigManager service | agent:Worker
### T1.1: Add enableWorkspace method to ConfigManager
- [x] S1.1.1: Add `enableWorkspace(workspacePath: string, config: WorkspaceConfig): Result<void, Error>` method | size:S

## M2: Refactor open.ts to use services | agent:Worker
### T2.1: Replace raw config functions with ConfigManager
- [x] S2.1.1: Import ConfigManager instead of raw parseConfigFile/writeConfigFile | size:S
- [x] S2.1.2: Replace manual config parsing with ConfigManager service | size:S
- [x] S2.1.3: Remove custom enableWorkspace function, use ConfigManager method | size:S

### T2.2: Replace sync logic with WorkspaceManager
- [x] S2.2.1: Import WorkspaceManager service | size:S
- [x] S2.2.2: Replace custom syncSingleWorkspace with WorkspaceManager.checkoutWorkspace | size:S
- [x] S2.2.3: Remove redundant GitManager usage | size:S

## M3: Final verification | agent:Reviewer
### T3.1: Run lsp diagnostics
- [x] S3.1.1: Verify no TypeScript errors | size:S

### T3.2: Run project tests/lint
- [x] S3.2.1: Run lint check | size:S
- [x] S3.2.2: Run format check | size:S