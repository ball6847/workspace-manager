/**
 * Real-git integration test fixtures.
 * Builds temp repos + worktrees to test branch resolution in both normal and worktree scenarios.
 * Test-only code; try/catch is allowed here (AGENTS.md §4 applies to application code).
 */

import { Result } from "typescript-result";
import { stringify } from "@std/yaml";
import type { WorkspaceConfig } from "../domain/config-schema.ts";

export type WorktreeFixture = {
	workspaceRoot: string; // superproject root (has workspace.yml, .gitmodules)
	configPath: string; // <workspaceRoot>/workspace.yml
	submodulePath: string; // <workspaceRoot>/sub
	upstreamDir: string; // origin repo for debug
	branch: string; // e.g. "feature"
	cleanup: () => Promise<void>;
};

/**
 * Helper to run a git command and return Result.
 */
async function runGit(
	cwd: string,
	args: string[],
): Promise<Result<Deno.CommandOutput, Error>> {
	return await Result.fromAsyncCatching(async () => {
		const output = await new Deno.Command("git", {
			args,
			cwd,
			stderr: "piped",
			stdout: "piped",
		}).output();
		if (!output.success) {
			const stderr = new TextDecoder().decode(output.stderr);
			throw new Error(
				`git ${args.join(" ")} failed in ${cwd}: ${stderr}`,
			);
		}
		return output;
	});
}

/**
 * Configure git user for a repo (required for commits).
 */
async function configureGitUser(repoDir: string): Promise<void> {
	const result1 = await runGit(repoDir, [
		"config",
		"user.email",
		"test@test.test",
	]);
	const result2 = await runGit(repoDir, [
		"config",
		"user.name",
		"Test User",
	]);
	if (!result1.ok) {
		throw result1.error;
	}
	if (!result2.ok) {
		throw result2.error;
	}
}

/**
 * Create a commit with a dummy file.
 */
async function createCommit(repoDir: string, message: string): Promise<void> {
	const timestamp = Date.now();
	await Deno.writeTextFile(`${repoDir}/commit-${timestamp}.txt`, message);

	const addResult = await runGit(repoDir, ["add", "."]);
	if (!addResult.ok) {
		throw addResult.error;
	}

	const commitResult = await runGit(repoDir, [
		"commit",
		"-m",
		message,
	]);
	if (!commitResult.ok) {
		throw commitResult.error;
	}
}

/**
 * Creates workspace.yml content.
 */
function createWorkspaceYaml(branch: string, overrideBranch?: string, urlOverride?: string): string {
	const config: WorkspaceConfig = {
		workspaces: [{
			url: urlOverride ?? "file:///dummy", // not used for read operations unless specified
			path: "sub",
			branch: overrideBranch ?? branch,
			isGolang: false,
			active: true,
		}],
	};
	return stringify(config as Record<string, unknown>);
}

/**
 * Builds a test fixture with the following topology:
 *
 * upstream: bare-ish repo with commits on "feature" branch
 * superproject: normal clone that adds upstream as a submodule at ./sub
 *
 * If isWorktree=true:
 * - Creates a worktree from superproject, placing submodule in detached HEAD
 * - Returns fixture pointing at the worktree
 *
 * If isWorktree=false:
 * - Returns fixture pointing at the superproject directly (submodule on branch)
 */
async function buildFixtureInternal(
	opts: { branch?: string; isWorktree: boolean; initSubmodule?: boolean; urlOverride?: string },
): Promise<WorktreeFixture> {
	const branch = opts.branch ?? "feature";

	// Create temp root
	const tempRoot = await Deno.makeTempDir({
		prefix: "wm-integration-",
	});

	// Directories
	const upstreamDir = `${tempRoot}/upstream`;
	const superDir = `${tempRoot}/super`;

	try {
		// ------------------------------
		// Step 1: Create upstream repo
		// ------------------------------
		await Deno.mkdir(upstreamDir);
		{
			const initResult = await runGit(upstreamDir, ["init"]);
			if (!initResult.ok) {
				throw initResult.error;
			}
			await configureGitUser(upstreamDir);

			// Initial commit on main (so main exists)
			await createCommit(upstreamDir, "c1");

			// Switch to feature branch and add second commit
			const checkoutResult = await runGit(upstreamDir, [
				"checkout",
				"-b",
				branch,
			]);
			if (!checkoutResult.ok) {
				throw checkoutResult.error;
			}
			await createCommit(upstreamDir, "c2");
		}

		// ------------------------------
		// Step 2: Create superproject
		// ------------------------------
		await Deno.mkdir(superDir);
		{
			const initResult = await runGit(superDir, ["init"]);
			if (!initResult.ok) {
				throw initResult.error;
			}
			await configureGitUser(superDir);

			// Add submodule pointing at upstream with branch tracking
			const submoduleResult = await runGit(superDir, [
				"submodule",
				"add",
				"-b",
				branch,
				upstreamDir,
				"sub",
			]);
			if (!submoduleResult.ok) {
				throw submoduleResult.error;
			}

			// Initial commit in superproject
			const addResult = await runGit(superDir, ["add", "."]);
			if (!addResult.ok) {
				throw addResult.error;
			}
			const commitResult = await runGit(superDir, [
				"commit",
				"-m",
				"add submodule",
			]);
			if (!commitResult.ok) {
				throw commitResult.error;
			}
		}

		// ------------------------------
		// Step 3: Choose final topology
		// ------------------------------
		let workspaceRoot: string;
		let submodulePath: string;

		if (opts.isWorktree) {
			// Create a worktree → puts HEAD in detached state
			workspaceRoot = `${tempRoot}/worktree`;

			const worktreeResult = await runGit(superDir, [
				"worktree",
				"add",
				workspaceRoot,
				"HEAD",
			]);
			if (!worktreeResult.ok) {
				throw worktreeResult.error;
			}

			// Optionally init + update submodule in the worktree → submodule detached at tip
			// When initSubmodule is false, the submodule dir remains empty (uninitialized)
			if (opts.initSubmodule !== false) {
				const subUpdateResult = await runGit(workspaceRoot, [
					"submodule",
					"update",
					"--init",
				]);
				if (!subUpdateResult.ok) {
					throw subUpdateResult.error;
				}
			}

			submodulePath = `${workspaceRoot}/sub`;
		} else {
			// Normal checkout: use superproject as-is, but need submodule initialized
			workspaceRoot = superDir;
			submodulePath = `${superDir}/sub`;

			// The submodule add already cloned it, but ensure it's on-branch not detached
			// (git submodule add leaves it in a state where HEAD is at the tip but the
			//  tracking branch is configured; let's explicitly checkout the branch)
			const checkoutResult = await runGit(submodulePath, [
				"checkout",
				branch,
			]);
			if (!checkoutResult.ok) {
				throw checkoutResult.error;
			}
		}

		// ------------------------------
		// Step 4: Write workspace.yml
		// ------------------------------
		const configPath = `${workspaceRoot}/workspace.yml`;
		await Deno.writeTextFile(
			configPath,
			createWorkspaceYaml(branch, undefined, opts.urlOverride),
		);

		// ------------------------------
		// Return fixture
		// ------------------------------
		return {
			workspaceRoot,
			configPath,
			submodulePath,
			upstreamDir,
			branch,
			cleanup: async () => {
				try {
					await Deno.remove(tempRoot, { recursive: true });
				} catch {
					// ignore cleanup errors
				}
			},
		};
	} catch (e) {
		// Clean up on error
		try {
			await Deno.remove(tempRoot, { recursive: true });
		} catch {
			// ignore
		}
		throw e;
	}
}

/**
 * Build a worktree-based fixture where the submodule is in detached HEAD state
 * (at the branch tip). This reproduces how git submodules behave inside git worktrees.
 */
export async function buildWorktreeFixture(opts?: {
	branch?: string;
}): Promise<WorktreeFixture> {
	return await buildFixtureInternal({
		branch: opts?.branch,
		isWorktree: true,
	});
}

/**
 * Build a normal fixture where the submodule is checked out normally on its branch.
 */
export async function buildNormalFixture(opts?: {
	branch?: string;
}): Promise<WorktreeFixture> {
	return await buildFixtureInternal({
		branch: opts?.branch,
		isWorktree: false,
	});
}

/**
 * Build a worktree-based fixture where the submodule directory exists but is
 * NOT initialized (no .git file, empty dir). This reproduces the reported bug
 * topology where git commands walk up to the superproject.
 */
export async function buildUninitializedFixture(opts?: {
	branch?: string;
	urlOverride?: string;
}): Promise<WorktreeFixture> {
	return await buildFixtureInternal({
		branch: opts?.branch,
		isWorktree: true,
		initSubmodule: false,
		urlOverride: opts?.urlOverride,
	});
}

export type MultiSubmoduleFixture = {
	workspaceRoot: string;
	configPath: string;
	submodulePaths: string[];
	upstreamDirs: string[];
	branch: string;
	cleanup: () => Promise<void>;
};

/**
 * Build a superproject with N registered but uninitialized submodules.
 * Each submodule directory exists as an empty dir inside a git worktree.
 */
export async function buildMultiSubmoduleUninitializedFixture(opts?: {
	count?: number;
	branch?: string;
}): Promise<MultiSubmoduleFixture> {
	const count = opts?.count ?? 2;
	const branch = opts?.branch ?? "feature";
	const tempRoot = await Deno.makeTempDir({ prefix: "wm-integration-" });

	const upstreamDirs: string[] = [];
	const submoduleNames: string[] = [];

	try {
		// Create upstream repos
		for (let i = 0; i < count; i++) {
			const upstreamDir = `${tempRoot}/upstream-${i}`;
			const name = `sub-${i}`;
			submoduleNames.push(name);
			upstreamDirs.push(upstreamDir);

			await Deno.mkdir(upstreamDir);
			const initResult = await runGit(upstreamDir, ["init"]);
			if (!initResult.ok) {
				throw initResult.error;
			}
			await configureGitUser(upstreamDir);
			await createCommit(upstreamDir, "c1");
			const checkoutResult = await runGit(upstreamDir, ["checkout", "-b", branch]);
			if (!checkoutResult.ok) {
				throw checkoutResult.error;
			}
			await createCommit(upstreamDir, "c2");
		}

		// Create superproject and add all submodules
		const superDir = `${tempRoot}/super`;
		await Deno.mkdir(superDir);
		const superInit = await runGit(superDir, ["init"]);
		if (!superInit.ok) {
			throw superInit.error;
		}
		await configureGitUser(superDir);

		for (let i = 0; i < count; i++) {
			const addResult = await runGit(superDir, [
				"submodule",
				"add",
				"-b",
				branch,
				upstreamDirs[i],
				submoduleNames[i],
			]);
			if (!addResult.ok) {
				throw addResult.error;
			}
		}

		const addResult = await runGit(superDir, ["add", "."]);
		if (!addResult.ok) {
			throw addResult.error;
		}
		const commitResult = await runGit(superDir, ["commit", "-m", "add submodules"]);
		if (!commitResult.ok) {
			throw commitResult.error;
		}

		// Create worktree so submodules are not auto-initialized
		const workspaceRoot = `${tempRoot}/worktree`;
		const worktreeResult = await runGit(superDir, ["worktree", "add", workspaceRoot, "HEAD"]);
		if (!worktreeResult.ok) {
			throw worktreeResult.error;
		}

		const submodulePaths = submoduleNames.map((name) => `${workspaceRoot}/${name}`);

		// Write workspace.yml with all submodules
		const configPath = `${workspaceRoot}/workspace.yml`;
		const config: WorkspaceConfig = {
			workspaces: submoduleNames.map((name) => ({
				url: `file://${upstreamDirs[submoduleNames.indexOf(name)]}`,
				path: name,
				branch,
				isGolang: false,
				active: true,
			})),
		};
		await Deno.writeTextFile(configPath, stringify(config as Record<string, unknown>));

		return {
			workspaceRoot,
			configPath,
			submodulePaths,
			upstreamDirs,
			branch,
			cleanup: async () => {
				try {
					await Deno.remove(tempRoot, { recursive: true });
				} catch {
					// ignore cleanup errors
				}
			},
		};
	} catch (e) {
		try {
			await Deno.remove(tempRoot, { recursive: true });
		} catch {
			// ignore
		}
		throw e;
	}
}

/**
 * Overwrite workspace.yml with a different branch value (for TC-4 save test).
 */
export async function writeWorkspaceYamlWithBranch(
	fixture: WorktreeFixture,
	branch: string,
): Promise<void> {
	const config: WorkspaceConfig = {
		workspaces: [{
			url: "file:///unused",
			path: "sub",
			branch: branch,
			isGolang: false,
			active: true,
		}],
	};
	const yaml = stringify(config as Record<string, unknown>);
	await Deno.writeTextFile(fixture.configPath, yaml);
}
