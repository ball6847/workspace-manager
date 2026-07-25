import { assert } from "@std/assert";
import { presentSyncReport } from "./sync.ts";
import type { SyncReport } from "../services/sync.ts";

function makeReport(overrides: Partial<SyncReport> = {}): SyncReport {
	return {
		workspaceRoot: "/ws",
		configPath: "/ws/workspace.yml",
		activeCount: 5,
		inactiveCount: 1,
		removedCount: 1,
		syncedCount: 5,
		updatedCount: 2,
		upToDateCount: 3,
		skippedDetachedCount: 0,
		goWorkspaceSetup: false,
		globalHookResults: [],
		workspaceHookResults: [],
		timing: {
			totalMs: 100,
			removalMs: 10,
			syncMs: 50,
			goWorkspaceMs: 0,
			hooksMs: 0,
			perWorkspaceMs: {},
		},
		...overrides,
	};
}

Deno.test("presentSyncReport prints updated and up-to-date counts", () => {
	const logs: string[] = [];
	const originalLog = console.log;
	console.log = (...args: unknown[]) => {
		logs.push(args.map((arg) => String(arg)).join(" "));
	};

	try {
		presentSyncReport(makeReport(), false);
	} finally {
		console.log = originalLog;
	}

	const output = logs.join("\n");
	assert(output.includes("Updated: 2"), `expected updated count, got: ${output}`);
	assert(output.includes("Up-to-date: 3"), `expected up-to-date count, got: ${output}`);
});
