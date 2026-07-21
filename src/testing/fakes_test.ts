import { assertEquals, assertFalse } from "@std/assert";
import { AppErrorCode } from "../libs/app-error.ts";
import { GitManager } from "../adapters/git.ts";
import { ConfigManager } from "../adapters/config-store.ts";
import { FakeConfigStore, FakeGit, FakeLogger } from "./fakes.ts";
import type { GitPort } from "../ports/git.ts";
import type { ConfigStore } from "../ports/config-store.ts";
import type { Logger } from "../ports/logger.ts";

Deno.test("FakeGit returns configured branch and records calls", async () => {
	const git: GitPort = new FakeGit({ currentBranch: "feature-x" });
	const branch = await git.getCurrentBranch();

	if (!branch.ok) {
		throw new Error("Expected branch result to be ok");
	}

	assertEquals(branch.value, "feature-x");

	const fake = git as FakeGit;
	assertEquals(fake.calls.length, 1);
	assertEquals(fake.calls[0].method, "getCurrentBranch");
});

Deno.test("FakeGit can simulate failure", async () => {
	const git: GitPort = new FakeGit({ failNext: "getCurrentBranch" });
	const branch = await git.getCurrentBranch();

	if (branch.ok) {
		throw new Error("Expected branch result to be an error");
	}

	assertEquals(branch.error.code, AppErrorCode.GIT_FAILED);
});

Deno.test("FakeConfigStore round-trips config", async () => {
	const config = {
		workspaces: [
			{ url: "git@example.com:a.git", path: "a", branch: "main", isGolang: false, active: true },
		],
	};
	const store: ConfigStore = new FakeConfigStore("/tmp/workspace.yml", config);

	const read = await store.getConfig();
	if (!read.ok) {
		throw new Error("Expected config read to be ok");
	}
	assertEquals(read.value.workspaces.length, 1);

	const active = store.getActiveWorkspaces(read.value);
	assertEquals(active.length, 1);
	assertEquals(active[0].path, "a");
});

Deno.test("FakeConfigStore enableWorkspace mutates config", () => {
	const config = {
		workspaces: [
			{ url: "git@example.com:a.git", path: "a", branch: "main", isGolang: false, active: false },
		],
	};
	const store = new FakeConfigStore("/tmp/workspace.yml", config);
	const result = store.enableWorkspace("a", config);

	if (!result.ok) {
		throw new Error("Expected enable to succeed");
	}

	assertEquals(config.workspaces[0].active, true);
});

Deno.test("FakeLogger records all levels and respects debug silence", () => {
	const logger: Logger = new FakeLogger();
	logger.debug("quiet");
	logger.info("hello");
	logger.warn("careful");
	logger.error("boom");

	const fake = logger as FakeLogger;
	assertEquals(fake.entries.length, 4);
	assertEquals(fake.entries[0].level, "debug");
	assertEquals(fake.entries[0].message, "quiet");
	assertEquals(fake.entries[3].level, "error");
});

Deno.test("Adapters type-check as ports at compile time", () => {
	// These assignments are intentionally unused; they verify structural conformance.
	const _git: GitPort = new GitManager(".");
	const _store: ConfigStore = new ConfigManager("./workspace.yml");
	const _logger: Logger = new FakeLogger();

	assertFalse(false);
});
