import { Result } from "typescript-result";
import { isDir } from "./file.ts";

export async function gitSubmoduleRemove(path: string, projectRoot: string) {
	// De-initialize the submodule
	// TODO: check if we need to join with projectRoot
	const deInit = await gitDeInit(path);
	if (!deInit.ok) {
		return Result.error(deInit.error);
	}

	// Remove the submodule from git
	const rm = await gitRm(path);
	if (!rm.ok) {
		return Result.error(rm.error);
	}

	// Remove the submodule's git directory if it exists
	const gitModulePath = `.git/modules/${path}`;
	const stat = await Result.fromAsyncCatching(() => Deno.stat(gitModulePath));
	if (!stat.ok) {
		// Directory doesn't exist, no need to remove
		return Result.ok(undefined);
	}

	// Not a directory
	if (stat.value.isDirectory) {
		const remove = await Result.fromAsyncCatching(() => Deno.remove(gitModulePath, { recursive: true }));
		if (!remove.ok) {
			return Result.error(remove.error);
		}
	}

	return Result.ok();
}

export function gitDeInit(path: string) {
	return Result.fromAsyncCatching(() =>
		new Deno.Command("git", {
			args: ["submodule", "deinit", "-f", path],
			stderr: "null",
		}).output()
	);
}

export function gitRm(path: string) {
	return Result.fromAsyncCatching(() =>
		new Deno.Command("git", {
			args: ["rm", "-f", path],
			stderr: "null",
		}).output()
	);
}
