import * as path from "@std/path";
import { Result } from "typescript-result";
import { AppError, AppErrorCode } from "../libs/app-error.ts";
import { buildLinkEntries, getLinkableWorkspaces, validateLinkMap } from "../domain/link-plan.ts";
import { workspaceDirectory } from "../domain/workspaces.ts";
import { yellow } from "@std/fmt/colors";
import type { ConfigStore } from "../ports/config-store.ts";
import type { Confirmer } from "../ports/confirmer.ts";
import type { FileSystemPort } from "../ports/file-system.ts";
import type { WorkspaceDiscoveryOptions, WorkspaceDiscoveryPort } from "../ports/workspace-discovery.ts";

export type LinkReport = {
	workspaceRoot: string;
	configPath: string;
	linkedCount: number;
	skippedCount: number;
	skippedWorkspaceCount: number;
};

export type LinkServiceDeps = {
	createDiscovery(options: WorkspaceDiscoveryOptions): WorkspaceDiscoveryPort;
	createConfigStore(configPath: string): ConfigStore;
	fileSystem: FileSystemPort;
	confirmer: Confirmer;
};

export type LinkInput = {
	config?: string;
	workspaceRoot?: string;
	debug?: boolean;
};

export class LinkService {
	constructor(private readonly deps: LinkServiceDeps) {}

	async run(input: LinkInput): Promise<Result<LinkReport, AppError>> {
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
				linkedCount: 0,
				skippedCount: 0,
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
				linkedCount: 0,
				skippedCount: 0,
				skippedWorkspaceCount,
			});
		}

		// Pre-validate all link maps before any FS operations (config-level errors fail fast)
		for (const workspace of presentWorkspaces) {
			const mapResult = validateLinkMap(workspace.link ?? {});
			if (!mapResult.ok) {
				return Result.error(mapResult.error); // CONFIG_INVALID
			}
		}

		// Phase 1 — all-or-nothing FS validation
		type EntryWithWorkspace = { workspace: typeof presentWorkspaces[number]; entries: import("../domain/link-plan.ts").LinkEntry[] };
		const allEntries: EntryWithWorkspace[] = [];
		const violations: string[] = [];

		for (const workspace of presentWorkspaces) {
			const entries = buildLinkEntries(workspaceRoot, workspace);
			for (const entry of entries) {
				// Source must exist
				const sourceStat = await this.deps.fileSystem.lstat(entry.source);
				if (!sourceStat.ok) {
					violations.push(`${workspace.path}: ${entry.key} -> ${entry.value}: source not found`);
					continue;
				}

				// Destination: if it exists and is a real directory (not symlink), violation
				const destStat = await this.deps.fileSystem.lstat(entry.destination);
				if (destStat.ok && destStat.value.isDirectory && !destStat.value.isSymlink) {
					violations.push(`${workspace.path}: ${entry.key} -> ${entry.value}: real directory conflict at destination`);
				}
			}

			allEntries.push({ workspace, entries });
		}

		if (violations.length > 0) {
			return Result.error(
				new AppError(
					AppErrorCode.LINK_VALIDATION_FAILED,
					`Link validation failed: ${violations.length} violation(s) found. Nothing was modified.`,
					{ context: { violations } },
				),
			);
		}

		// Phase 2 — linking
		let linkedCount = 0;
		let skippedCount = 0;

		for (const { entries } of allEntries) {
			for (const entry of entries) {
				const destStat = await this.deps.fileSystem.lstat(entry.destination);

				if (destStat.ok) {
					if (destStat.value.isSymlink) {
						// Read the symlink target and compare
						const readResult = await this.deps.fileSystem.readLink(entry.destination);
						if (readResult.ok) {
							const existingTarget = path.normalize(readResult.value);
							const expectedTarget = path.normalize(entry.target);
							if (existingTarget === expectedTarget) {
								// Already correct — count it (idempotent)
								linkedCount++;
								continue;
							}
						}
						// Wrong target or read failed — treat as conflict
					}
					// Real file, wrong symlink, or dangling symlink — prompt
					const confirmResult = await this.deps.confirmer.confirm(`Overwrite ${entry.destination}?`);
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
				}
				// Destination missing (or just removed) — create
				const parentDir = path.dirname(entry.destination);
				const ensureResult = await this.deps.fileSystem.ensureDir(parentDir);
				if (!ensureResult.ok) {
					return Result.error(ensureResult.error);
				}
				const linkResult = await this.deps.fileSystem.createSymlink(entry.target, entry.destination);
				if (!linkResult.ok) {
					return Result.error(linkResult.error);
				}
				linkedCount++;
			}
		}

		return Result.ok({
			workspaceRoot,
			configPath,
			linkedCount,
			skippedCount,
			skippedWorkspaceCount,
		});
	}
}
