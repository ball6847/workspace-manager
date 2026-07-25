/**
 * Integration test for batched submodule initialization.
 *
 * Verifies that GitManager.submoduleInitMany clones multiple registered
 * submodules in a single git invocation.
 */

import { assert, assertEquals } from "@std/assert";
import { GitManager } from "../adapters/git.ts";
import { buildMultiSubmoduleUninitializedFixture } from "./git_fixture.ts";

Deno.test("submodule batch init — clones multiple registered submodules in one call", async () => {
	const fixture = await buildMultiSubmoduleUninitializedFixture({ count: 2, branch: "feature" });
	try {
		const rootGit = new GitManager(fixture.workspaceRoot);

		// Precondition: submodule dirs are not repositories
		for (const path of fixture.submodulePaths) {
			const before = await new GitManager(path).isRepository();
			assert(before.ok, `isRepository failed before batch init: ${!before.ok ? before.error.message : ""}`);
			assertEquals(before.value, false, `expected ${path} not to be a repo before batch init`);
		}

		const result = await rootGit.submoduleInitMany(
			fixture.submodulePaths.map((p) => p.slice(fixture.workspaceRoot.length + 1)),
			2,
		);

		assert(result.ok, `submoduleInitMany failed: ${!result.ok ? result.error.message : ""}`);

		// Postcondition: all submodule dirs are now repositories
		for (const path of fixture.submodulePaths) {
			const after = await new GitManager(path).isRepository();
			assert(after.ok, `isRepository failed after batch init: ${!after.ok ? after.error.message : ""}`);
			assertEquals(after.value, true, `expected ${path} to be a repo after batch init`);
		}
	} finally {
		await fixture.cleanup();
	}
});
