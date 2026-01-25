# Mission: Merge config.ts into ConfigManager class (internal functions only)

## M1: Refactor ConfigManager | status:completed
### T1.1: Make functions internal | agent:Worker
- [x] S1.1.1: Removed `export` from parseConfigFile and writeConfigFile functions | size:S
- [x] S1.1.2: Functions now only accessible via ConfigManager class methods | size:S
- [x] S1.1.3: Added `configPath` getter to ConfigManager for accessing config file path | size:S

### T1.2: Update command files to use ConfigManager | agent:Worker | depends:T1.1
- [x] S1.2.1: Refactor src/cmds/open.ts - already uses ConfigManager | size:S
- [x] S1.2.2: Refactor src/cmds/status.ts - now uses ConfigManager.parseConfig() | size:S
- [x] S1.2.3: Refactor src/cmds/save.ts - now uses ConfigManager methods | size:S
- [x] S1.2.4: Refactor src/cmds/add.ts - now uses ConfigManager methods + configPath getter | size:S
- [x] S1.2.5: Refactor src/cmds/update.ts - now uses ConfigManager.parseConfig() | size:S
- [x] S1.2.6: Refactor src/cmds/enable.ts - now uses ConfigManager methods + configPath getter | size:S

## M2: Final Verification | status:completed
### T2.1: Build verification | agent:Reviewer | depends:M1
- [x] S2.1.1: `deno task lint` - Passed (19 files checked) | size:S
- [x] S2.1.2: `deno task check` - All types valid | size:S
- [x] S2.1.3: `deno task build` - Bundled 278 modules (402.48KB) | size:S

## API Summary
```typescript
// Types remain exported (useful for consumers)
export type WorkspaceConfigItem = { ... };
export type WorkspaceConfig = { ... };

// Functions are now internal (not exported)
function parseConfigFile(path: string): Promise<Result<WorkspaceConfig, Error>>;
function writeConfigFile(config: WorkspaceConfig, path: string): Promise<Result<void, Error>>;

// Only class methods are exposed
export class ConfigManager {
  constructor(private readonly configFile: string) {}
  get configPath(): string;  // NEW: getter for config file path

  async parseConfig(): Promise<Result<WorkspaceConfig, Error>> {}
  async writeConfig(config: WorkspaceConfig): Promise<Result<void, Error>> {}
  // ... other methods
}
```