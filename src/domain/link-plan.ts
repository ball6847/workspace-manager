import * as path from "@std/path";
import { Result } from "typescript-result";
import { AppError, AppErrorCode } from "../libs/app-error.ts";
import type { WorkspaceConfig, WorkspaceConfigItem } from "../types/config.ts";

export type LinkEntry = {
	workspacePath: string;
	key: string;
	value: string;
	destination: string;
	source: string;
	target: string;
};

/**
 * Validate a single link path (key or value).
 * Rejects: empty/whitespace-only, absolute paths, any segment equal to `..`.
 */
export function validateLinkPath(p: string): Result<void, AppError> {
	const trimmed = p.trim();
	if (trimmed.length === 0) {
		return Result.error(
			new AppError(AppErrorCode.CONFIG_INVALID, "link path must not be empty or whitespace-only", { context: { path: p } }),
		);
	}

	if (path.isAbsolute(p)) {
		return Result.error(
			new AppError(AppErrorCode.CONFIG_INVALID, "link path must not be absolute", { context: { path: p } }),
		);
	}

	// Reject Windows-style absolute paths (e.g. "C:\foo") on all platforms.
	if (/^[a-zA-Z]:[\\/]/.test(p)) {
		return Result.error(
			new AppError(AppErrorCode.CONFIG_INVALID, "link path must not be absolute", { context: { path: p } }),
		);
	}

	// Split on both / and \ to catch Windows-style paths too
	const segments = p.split(/[\/\\]/);
	for (const segment of segments) {
		if (segment === "..") {
			return Result.error(
				new AppError(AppErrorCode.CONFIG_INVALID, "link path must not contain '..' segments", { context: { path: p } }),
			);
		}
	}

	return Result.ok();
}

/**
 * Validate every key and value in a link map. Fails fast on first violation.
 */
export function validateLinkMap(link: Record<string, string>): Result<void, AppError> {
	for (const key of Object.keys(link)) {
		const keyResult = validateLinkPath(key);
		if (!keyResult.ok) {
			return Result.error(keyResult.error);
		}
	}

	for (const value of Object.values(link)) {
		const valueResult = validateLinkPath(value);
		if (!valueResult.ok) {
			return Result.error(valueResult.error);
		}
	}

	return Result.ok();
}

/**
 * Filter workspaces that are active AND have a non-empty link map.
 */
export function getLinkableWorkspaces(config: WorkspaceConfig): WorkspaceConfigItem[] {
	return config.workspaces.filter((item) => item.active && item.link && Object.keys(item.link).length > 0);
}

/**
 * Build link entries for a single workspace.
 * Computes absolute source/destination and relative symlink target.
 */
export function buildLinkEntries(workspaceRoot: string, workspace: WorkspaceConfigItem): LinkEntry[] {
	const linkMap = workspace.link ?? {};
	const entries: LinkEntry[] = [];

	for (const [key, value] of Object.entries(linkMap)) {
		const destination = path.join(workspaceRoot, workspace.path, key);
		const source = path.join(workspaceRoot, value);
		const target = path.relative(path.dirname(destination), source);

		entries.push({
			workspacePath: workspace.path,
			key,
			value,
			destination,
			source,
			target,
		});
	}

	return entries;
}
