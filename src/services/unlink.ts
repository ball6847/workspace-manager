import { Result } from "typescript-result";
import { AppError } from "../libs/app-error.ts";
import { buildLinkEntries, getLinkableWorkspaces, validateLinkMap } from "../domain/unlink-plan.ts";
import { workspaceDirectory } from "../domain/workspaces.ts";
import { yellow } from "@std/fmt/colors";
import type { ConfigStore } from "../ports/config-store.ts";
import type { Confirmer } from "../ports/confirmer.ts";
import type { FileSystemPort } from "../ports/file-system.ts";
import type { WorkspaceDiscoveryOptions, WorkspaceDiscoveryPort } from "../ports/workspace-discovery.ts";

export type UnlinkReport = {
	workspaceRoot: string;
	configPath: string;
	unlinkedCount: number;
	skippedCount: number;
	warnedCount: number;
	skippedWorkspaceCount: number;
};

export type UnlinkServiceDeps = {
	createDiscovery(options: WorkspaceDiscoveryOptions): WorkspaceDiscoveryPort;
	createConfigStore(configPath: string): ConfigStore;
	fileSystem: FileSystemPort;
	confirmer: Confirmer;
};

export type UnlinkInput = {
	config?: string;
	workspaceRoot?: string;
	debug?: boolean;
};

export class UnlinkService {
	constructor(private readonly deps: UnlinkServiceDeps) {}

	async run(input: UnlinkInput): Promise<Result<UnlinkReport, AppError>> {
		const discovery = this.deps.createDiscovery({
			config: input.config,
			workspaceRoot: input.workspaceRoot,
		});

		const discoverResult = await discovery.discover();
		if (!discoverResult.ok) {
			return Result.error(discoverResult.error);
		}

		const { workspaceRoot, configPath } = discoverResult.value;

		const configStore = this.deps.createConfigStore(configPath);
		const configResult = await configStore.getWorkspaceConfig(workspaceRoot);
		if (!configResult.ok) {
			return Result.error(configResult.error);
		}
		const config = configResult.value;

		const linkableWorkspaces = getLinkableWorkspaces(config);
		if (linkableWorkspaces.length === 0) {
			return Result.ok({
				workspaceRoot,
				configPath,
				unlinkedCount: 0,
				skippedCount: 0,
				warnedCount: 0,
				skippedWorkspaceCount: 0,
			});
		}

		// Filter out workspaces whose submodule directory is missing
		const presentWorkspaces: typeof linkableWorkspaces = [];
		let skippedWorkspaceCount = 0;

		for (const workspace of linkableWorkspaces) {
			const workspaceDir = workspaceDirectory(workspaceRoot, workspace.path);
			const dirCheck = await this.deps.fileSystem.isDir(workspaceDir);
			if (!dirCheck.ok) {
				console.log(
					yellow(`⚠️  Submodule not found: ${workspace.path} — run \`sync\` to grab the missing submodule. Skipping.`),
				);
				skippedWorkspaceCount++;
				continue;
			}
			presentWorkspaces.push(workspace);
		}

		if (presentWorkspaces.length === 0) {
			return Result.ok({
				workspaceRoot,
				configPath,
				unlinkedCount: 0,
				skippedCount: 0,
				warnedCount: 0,
				skippedWorkspaceCount,
			});
		}

		// Validate all link maps before any FS operations
		for (const workspace of presentWorkspaces) {
			const mapResult = validateLinkMap(workspace.link ?? {});
			if (!mapResult.ok) {
				return Result.error(mapResult.error); // CONFIG_INVALID
			}
		}

		// Build entries for all present workspaces
		type EntryWithWorkspace = { workspace: typeof presentWorkspaces[number]; entries: import("../domain/unlink-plan.ts").LinkEntry[] };
		const allEntries: EntryWithWorkspace[] = [];

		for (const workspace of presentWorkspaces) {
			const entries = buildLinkEntries(workspaceRoot, workspace);
			allEntries.push({ workspace, entries });
		}

		// Process entries
		let unlinkedCount = 0;
		let skippedCount = 0;
		let warnedCount = 0;

		for (const { entries } of allEntries) {
			for (const entry of entries) {
				const statResult = await this.deps.fileSystem.lstat(entry.destination);

				// Destination doesn't exist — silent skip (idempotent)
				if (!statResult.ok) {
					skippedCount++;
					continue;
				}

				// Destination is NOT a symlink — warn and skip (never remove real files)
				if (!statResult.value.isSymlink) {
					console.log(
						yellow(`⚠️  ${entry.destination} is not a symlink — leaving it untouched.`),
					);
					warnedCount++;
					continue;
				}

				// Destination IS a symlink — prompt for removal
				const confirmResult = await this.deps.confirmer.confirm(`Remove ${entry.destination}?`);
				if (!confirmResult.ok) {
					return Result.error(confirmResult.error);
				}
				if (!confirmResult.value) {
					skippedCount++;
					continue;
				}

				const removeResult = await this.deps.fileSystem.remove(entry.destination);
				if (!removeResult.ok) {
					return Result.error(removeResult.error);
				}
				unlinkedCount++;
			}
		}

		return Result.ok({
			workspaceRoot,
			configPath,
			unlinkedCount,
			skippedCount,
			warnedCount,
			skippedWorkspaceCount,
		});
	}
}
