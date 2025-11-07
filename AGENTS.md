Technical Constraints

- Deno 2.4 with TypeScript - see https://docs.deno.com
- Command line application framework using Cliffy - see https://cliffy.io
- TypeScript error handling using `typescript-result` instead of try-catch - see https://www.typescript-result.dev
- Must follow SOLID principles - https://en.wikipedia.org/wiki/SOLID
- Use `type` instead of `interface`
- Use async-await for asynchronous operations
- Use early-return pattern for control flow
- Use `type` keyword when importing types from other files

Directory Structure

- `main.ts` - main entry point of the CLI application
- `libs/` - reusable utility libraries
  - `config.ts` - workspace configuration file parser
  - `git.ts` - git operations (submodules, branches, status)
  - `file.ts` - file system utilities (directory checks, validation)
  - `go.ts` - Go workspace management utilities
  - `concurrent.ts` - concurrent processing utilities
  - `errors.ts` - custom error types and error handling
- `cmds/` - CLI command implementations (one command per file)
  - `sync.ts` - synchronize workspace with remote repositories
  - `enable.ts` - enable workspace items
  - `disable.ts` - disable workspace items
  - `update.ts` - update workspace items
- `build/` - compiled output directory
  - `cli.js` - compiled CLI executable
- `example/` - example configuration files
  - `workspace.yml` - sample workspace configuration
- `deno.json` - Deno project configuration
- `deno.lock` - Deno dependency lock file

Error Handling - Example

```typescript
import { Result } from "typescript-result";

type Config = {
  name: string;
  version: number;
};

const readFile = Result.wrap(
  (filePath: string) => fs.readFile(filePath, "utf-8"),
  (error) => new IOError(`Unable to read file`, { cause: error }),
);

const parseConfig = Result.wrap(
  (data: unknown) => {
    /* your favorite schema validation lib here */
    return data as Config;
  },
  (error) => new ValidationError(`Invalid configuration`, { cause: error }),
);

function getConfig(path: string) {
  return readFile(path)
    .mapCatching(
      (contents) => JSON.parse(contents),
      (error) => new ParseError("Unable to parse JSON", { cause: error }),
    )
    .map((json) => parseConfig(json));
}

const result = await getConfig("config.json");
```
