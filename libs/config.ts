import { parse, stringify } from "@std/yaml";
import { Result } from "typescript-result";
import { ErrorWithCause } from "./errors.ts";

export type WorkspaceConfigItem = {
	url: string;
	path: string;
	branch: string;
	isGolang: boolean;
	active: boolean;
};

export type WorkspaceConfig = {
	workspaces: WorkspaceConfigItem[];
};

/**
 * Parse workspace config file
 *
 * @param path Path to workspace config file
 * @returns Workspace config async result
 */
export function parseConfigFile(path: string): Promise<Result<WorkspaceConfig, Error>> {
	return Result.fromAsync(() => parseConfig(path))
		.mapError(
			(error) => new ErrorWithCause(`Unable to read or parse config file`, error as Error),
		);
}

async function parseConfig(path: string) {
	const contents = await Deno.readTextFile(path);
	return parse(contents) as WorkspaceConfig;
}

/**
 * Write workspace config to file
 *
 * @param config Workspace configuration to write
 * @param path Path to workspace config file
 * @returns Result indicating success or failure
 */
export function writeConfigFile(config: WorkspaceConfig, path: string): Promise<Result<void, Error>> {
	return Result.fromAsync(() => writeConfig(config, path))
		.mapError(
			(error) => new ErrorWithCause(`Unable to write config file`, error as Error),
		);
}

async function writeConfig(config: WorkspaceConfig, path: string) {
	const yamlContent = stringify(config);
	await Deno.writeTextFile(path, yamlContent);
}
