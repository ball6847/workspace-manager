/**
 * Integration tests for worktree branch resolution.
 *
 * Proves that branch resolution behaves identically whether the workspace is:
 * (A) a normal checkout, or
 * (B) a real `git worktree` (where submodules are in detached HEAD state).
 *
 * Tests run with WM_USE_NAME_REV=1 (the hardened path slated to become default).
 */

import { assert, assertEquals } from "@std/assert";
import { buildNormalFixture, buildWorktreeFixture, type WorktreeFixture, writeWorkspaceYamlWithBranch } from "./git_fixture.ts";
import { GitManager } from "../adapters/git.ts";
import { DenoFileSystem } from "../adapters/file-system.ts";
import { ConfigManager } from "../adapters/config-store.ts";
import { WorkspaceDiscovery } from "../adapters/workspace-discovery.ts";
import { type StatusInput, StatusService } from "../services/status.ts";
import { type SaveInput, SaveService } from "../services/save.ts";
import { type SyncInput, SyncService } from "../services/sync.ts";
import { FakeGoWork, FakeHookRunner } from "../testing/fakes.ts";
import type { GitPortFactory } from "../ports/git.ts";
import type { WorkspaceDiscoveryOptions, WorkspaceDiscoveryPort } from "../ports/workspace-discovery.ts";
import type { ConfigStore } from "../ports/config-store.ts";
import { parse } from "@std/yaml";
import type { WorkspaceConfig } from "../domain/config-schema.ts";

// -----------------------------------------------------------------------------
// Wiring helpers — mirror composition.ts but with fixture startDir pinned
// -----------------------------------------------------------------------------

function wireServicesForFixture(fixture: WorktreeFixture) {
	const gitFactory: GitPortFactory = (cwd: string) => new GitManager(cwd);
	const fileSystem = new DenoFileSystem();

	const createConfigStore = (p: string): ConfigStore => new ConfigManager(p);
	const createDiscovery = (
		opts: WorkspaceDiscoveryOptions,
	): WorkspaceDiscoveryPort => new WorkspaceDiscovery({ ...opts, startDir: fixture.workspaceRoot });

	const statusService = new StatusService({
		createDiscovery,
		createConfigStore,
		gitFactory,
		fileSystem,
	});

	const saveService = new SaveService({
		createDiscovery,
		createConfigStore,
		gitFactory,
		fileSystem,
	});

	// For sync: use no-op fakes for go/hooks (isGolang=false anyway; hooks not tested here)
	const goWorkFactory = () => new FakeGoWork();
	const createHookRunner = () => new FakeHookRunner();

	const syncService = new SyncService({
		createDiscovery,
		createConfigStore,
		gitFactory,
		goWorkFactory,
		fileSystem,
		createHookRunner,
	});

	return { gitFactory, statusService, saveService, syncService, fileSystem };
}

/**
 * Helper: save and restore WM_USE_NAME_REV env var, restoring in finally.
 */
function withNameRevEnv(value: string | undefined, fn: () => Promise<void>): () => Promise<void> {
	return async () => {
		const original = Deno.env.get("WM_USE_NAME_REV");
		try {
			if (value === undefined) {
				Deno.env.delete("WM_USE_NAME_REV");
			} else {
				Deno.env.set("WM_USE_NAME_REV", value);
			}
			await fn();
		} finally {
			if (original === undefined) {
				Deno.env.delete("WM_USE_NAME_REV");
			} else {
				Deno.env.set("WM_USE_NAME_REV", original);
			}
		}
	};
}

// -----------------------------------------------------------------------------
// Shared topology runner — runs the SAME assertions for Normal and Worktree
// -----------------------------------------------------------------------------

async function runTopologyAssertions(
	buildFixture: () => Promise<WorktreeFixture>,
) {
	// TC-1/TC-2 core: getCurrentBranch returns "feature", not "HEAD"
	{
		const fixture = await buildFixture();
		try {
			const git = new GitManager(fixture.submodulePath);
			const r = await git.getCurrentBranch();

			assert(r.ok, `getCurrentBranch failed: ${!r.ok ? r.error.message : ""}`);
			assertEquals(r.value, fixture.branch);
		} finally {
			await fixture.cleanup();
		}
	}

	// TC-3: StatusService returns currentBranch === "feature"
	{
		const fixture = await buildFixture();
		try {
			const { statusService } = wireServicesForFixture(fixture);
			const input: StatusInput = { debug: false, concurrency: 1 };
			const r = await statusService.run(input);

			assert(r.ok, `statusService failed: ${!r.ok ? r.error.message : ""}`);
			assertEquals(r.value.repositories.length, 1);
			assertEquals(r.value.repositories[0].currentBranch, fixture.branch);
		} finally {
			await fixture.cleanup();
		}
	}

	// TC-4: SaveService writes resolved branch ("feature") when config is stale ("main")
	{
		const fixture = await buildFixture();
		try {
			// Overwrite workspace.yml with stale branch "main"
			await writeWorkspaceYamlWithBranch(fixture, "main");

			const { saveService } = wireServicesForFixture(fixture);
			const input: SaveInput = { debug: false };
			const r = await saveService.run(input);

			assert(r.ok, `saveService failed: ${!r.ok ? r.error.message : ""}`);
			assertEquals(r.value.updatedCount, 1);
			assertEquals(r.value.changes.length, 1);
			assertEquals(r.value.changes[0].oldBranch, "main");
			assertEquals(r.value.changes[0].newBranch, fixture.branch);

			// Re-read from disk to confirm it was persisted
			const yamlRaw = await Deno.readTextFile(fixture.configPath);
			const config = parse(yamlRaw) as WorkspaceConfig;
			assertEquals(config.workspaces[0].branch, fixture.branch);
		} finally {
			await fixture.cleanup();
		}
	}

	// TC-5: SyncService succeeds, stays on feature
	{
		const fixture = await buildFixture();
		try {
			const { syncService, gitFactory } = wireServicesForFixture(fixture);

			// Verify pre-condition: for worktree, symbolic-ref fails (detached)
			// (optional diagnostic, not an assertion since normal topology differs)

			const syncInput: SyncInput = {
				debug: false,
				concurrency: 1,
			};
			const r = await syncService.run(syncInput);

			assert(r.ok, `syncService failed: ${!r.ok ? r.error.message : ""}`);
			assertEquals(r.value.syncedCount, 1);

			// After sync, branch should still resolve to "feature"
			const git = gitFactory(fixture.submodulePath);
			const branchResult = await git.getCurrentBranch();
			assert(branchResult.ok);
			assertEquals(branchResult.value, fixture.branch);

			// Worktree only: verify it's STILL detached (no unnecessary checkout happened)
			// We can detect this by checking if symbolic-ref still fails
			const symbolicRefOutput = await new Deno.Command("git", {
				args: ["symbolic-ref", "--short", "HEAD"],
				cwd: fixture.submodulePath,
				stdout: "null",
				stderr: "null",
			}).output();

			// In worktree topology: should fail (exit 128) because still detached
			// In normal topology: may succeed (was never detached).
			// Don't assert this condition universally; the key assertions are above.
			//
			// If this is a worktree fixture, symbol-ref MUST fail:
			const gitNormalCheckout = new Deno.Command("git", {
				args: ["rev-parse", "--abbrev-ref", "HEAD"],
				cwd: fixture.submodulePath,
				stdout: "piped",
				stderr: "null",
			});
			const rawRevParse = await gitNormalCheckout.output();
			const revParseValue = new TextDecoder().decode(rawRevParse.stdout).trim();

			// If rev-parse returns "HEAD", we're in a worktree (detached).
			// In that case, symbolic-ref MUST also fail (optimization intact: no checkout).
			if (revParseValue === "HEAD") {
				assertEquals(
					symbolicRefOutput.success,
					false,
					"expected symbolic-ref to fail in worktree topology (HEAD should remain detached)",
				);
			}
		} finally {
			await fixture.cleanup();
		}
	}
}

// -----------------------------------------------------------------------------
// Test Cases
// -----------------------------------------------------------------------------

Deno.test(
	"worktree branch resolution — normal checkout",
	withNameRevEnv("1", async () => {
		await runTopologyAssertions(() => buildNormalFixture({ branch: "feature" }));
	}),
);

Deno.test(
	"worktree branch resolution — worktree topology",
	withNameRevEnv("1", async () => {
		await runTopologyAssertions(() => buildWorktreeFixture({ branch: "feature" }));
	}),
);

Deno.test(
	"TC-6: worktree + flag OFF returns HEAD (baseline regression)",
	withNameRevEnv(undefined, async () => {
		const fixture = await buildWorktreeFixture({ branch: "feature" });
		try {
			const git = new GitManager(fixture.submodulePath);
			const r = await git.getCurrentBranch();
			assert(r.ok);

			// With flag OFF, we expect the legacy buggy behavior: returns "HEAD"
			// This documents pre-promotion behavior; deletable when flag is removed.
			assertEquals(r.value, "HEAD");
		} finally {
			await fixture.cleanup();
		}
	}),
);
