/**
 * Integration tests for GitManager.syncBranch().
 *
 * Covers:
 * - P0: up-to-date branch performs no merge and returns { updated: false }
 * - P0: behind branch fast-forwards and returns { updated: true }
 * - P0: diverged histories return GIT_FAILED, leave HEAD unchanged, no MERGE_HEAD
 */

import { assert, assertEquals } from "@std/assert";
import { buildNormalFixture } from "./git_fixture.ts";
import { GitManager } from "../adapters/git.ts";
import { AppErrorCode } from "../libs/app-error.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function runGit(cwd: string, args: string[]): Promise<void> {
	const output = await new Deno.Command("git", {
		args,
		cwd,
		stdout: "null",
		stderr: "piped",
	}).output();
	assertEquals(output.success, true, `git ${args.join(" ")} failed in ${cwd}`);
}

async function gitRevParse(cwd: string, ref: string): Promise<string> {
	const output = await new Deno.Command("git", {
		args: ["rev-parse", ref],
		cwd,
		stdout: "piped",
		stderr: "piped",
	}).output();
	assertEquals(output.success, true, `git rev-parse ${ref} failed in ${cwd}`);
	return new TextDecoder().decode(output.stdout).trim().toLowerCase();
}

async function gitDir(cwd: string): Promise<string> {
	const output = await new Deno.Command("git", {
		args: ["rev-parse", "--git-dir"],
		cwd,
		stdout: "piped",
		stderr: "piped",
	}).output();
	assertEquals(output.success, true, `git rev-parse --git-dir failed in ${cwd}`);
	const raw = new TextDecoder().decode(output.stdout).trim();
	// --git-dir may return a relative path (e.g. ".git" or "../.git/modules/sub");
	// resolve it relative to cwd so Deno.stat works.
	return raw.startsWith("/") ? raw : `${cwd}/${raw}`;
}

async function configureGitUser(cwd: string): Promise<void> {
	await runGit(cwd, ["config", "user.email", "test@test.test"]);
	await runGit(cwd, ["config", "user.name", "Test User"]);
}

async function createCommit(cwd: string, message: string): Promise<void> {
	const timestamp = Date.now();
	await Deno.writeTextFile(`${cwd}/commit-${timestamp}.txt`, message);
	await runGit(cwd, ["add", "."]);
	await runGit(cwd, ["commit", "-m", message]);
}

async function mergeHeadExists(cwd: string): Promise<boolean> {
	const dir = await gitDir(cwd);
	try {
		await Deno.stat(`${dir}/MERGE_HEAD`);
		return true;
	} catch {
		return false;
	}
}

// ---------------------------------------------------------------------------
// Test Cases
// ---------------------------------------------------------------------------

Deno.test(
	"syncBranch — up-to-date branch performs no merge (TC-01)",
	async () => {
		const fixture = await buildNormalFixture({ branch: "feature" });
		try {
			const git = new GitManager(fixture.submodulePath);
			const headBefore = await gitRevParse(fixture.submodulePath, "HEAD");

			const result = await git.syncBranch("feature");

			assert(result.ok, `syncBranch failed: ${!result.ok ? result.error.message : ""}`);
			assertEquals(result.value.updated, false, "expected updated=false for up-to-date branch");

			const headAfter = await gitRevParse(fixture.submodulePath, "HEAD");
			assertEquals(headAfter, headBefore, "HEAD must not move when already up-to-date");

			assertEquals(await mergeHeadExists(fixture.submodulePath), false, "no merge should be in progress");
		} finally {
			await fixture.cleanup();
		}
	},
);

Deno.test(
	"syncBranch — behind branch fast-forwards (TC-02)",
	async () => {
		const fixture = await buildNormalFixture({ branch: "feature" });
		try {
			// Pre-condition: reset local branch one commit behind the remote tip.
			await runGit(fixture.submodulePath, ["reset", "--hard", "HEAD~1"]);

			const git = new GitManager(fixture.submodulePath);
			const result = await git.syncBranch("feature");

			assert(result.ok, `syncBranch failed: ${!result.ok ? result.error.message : ""}`);
			assertEquals(result.value.updated, true, "expected updated=true for behind branch");

			const headAfter = await gitRevParse(fixture.submodulePath, "HEAD");
			const originFeature = await gitRevParse(fixture.submodulePath, "origin/feature");
			assertEquals(headAfter, originFeature, "HEAD must equal origin/feature after fast-forward");
		} finally {
			await fixture.cleanup();
		}
	},
);

Deno.test(
	"syncBranch — diverged histories error without merging (TC-03)",
	async () => {
		const fixture = await buildNormalFixture({ branch: "feature" });
		try {
			// Local-only commit in the submodule.
			await configureGitUser(fixture.submodulePath);
			await createCommit(fixture.submodulePath, "local-only");
			const headBefore = await gitRevParse(fixture.submodulePath, "HEAD");

			// Remote-only commit in upstream so origin/feature diverges from local.
			await createCommit(fixture.upstreamDir, "remote-only");

			const git = new GitManager(fixture.submodulePath);
			const result = await git.syncBranch("feature");

			assert(!result.ok, "expected syncBranch to fail for diverged histories");
			assertEquals(result.error.code, AppErrorCode.GIT_FAILED, "expected GIT_FAILED error code");
			assert(
				result.error.message.toLowerCase().includes("fast-forward") || result.error.message.toLowerCase().includes("diverged"),
				`error message should mention fast-forward or diverged, got: ${result.error.message}`,
			);

			const headAfter = await gitRevParse(fixture.submodulePath, "HEAD");
			assertEquals(headAfter, headBefore, "HEAD must not change on diverged sync failure");

			assertEquals(await mergeHeadExists(fixture.submodulePath), false, "no MERGE_HEAD should be left behind");
		} finally {
			await fixture.cleanup();
		}
	},
);
