import * as path from "@std/path";
import type { WorkspaceConfig, WorkspaceConfigItem } from "../types/config.ts";

export function getActiveWorkspaces(config: WorkspaceConfig): WorkspaceConfigItem[] {
	return config.workspaces.filter((item) => item.active);
}

export function getInactiveWorkspaces(config: WorkspaceConfig): WorkspaceConfigItem[] {
	return config.workspaces.filter((item) => !item.active);
}

export function goModulePaths(workspaces: WorkspaceConfigItem[]): string[] {
	return workspaces.filter((workspace) => workspace.isGolang).map((workspace) => workspace.path);
}

export function workspaceDirectory(workspaceRoot: string, workspacePath: string): string {
	return path.join(workspaceRoot, workspacePath);
}

export function extractRepoName(repoUrl: string): string {
	const patterns = [
		/\/([^/]+)\.git$/,
		/\/([^/]+)$/,
		/:([^/]+)\.git$/,
		/:([^/]+)$/,
	];

	for (const pattern of patterns) {
		const match = repoUrl.match(pattern);
		if (match) {
			return match[1];
		}
	}

	return repoUrl.split("/").pop()?.replace(".git", "") || "repository";
}
