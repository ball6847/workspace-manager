import { assert, assertEquals, assertFalse } from "@std/assert";
import { AppErrorCode } from "../libs/app-error.ts";
import { buildLinkEntries, getLinkableWorkspaces, validateLinkMap, validateLinkPath } from "./unlink-plan.ts";
import type { WorkspaceConfig, WorkspaceConfigItem } from "../types/config.ts";

Deno.test("TC-U101: re-exported buildLinkEntries produces correct entries for unlink scenarios", () => {
	const workspace: WorkspaceConfigItem = {
		url: "git@example.com:org/repo.git",
		path: "projects/repo1",
		branch: "main",
		isGolang: false,
		active: true,
		link: {
			"AGENT.md": "prompt/BACKEND.md",
			".agents": ".agents",
		},
	};

	const entries = buildLinkEntries("/ws", workspace);

	assertEquals(entries.length, 2);

	const agentMd = entries.find((e) => e.key === "AGENT.md")!;
	assertEquals(agentMd.source, "/ws/prompt/BACKEND.md");
	assertEquals(agentMd.destination, "/ws/projects/repo1/AGENT.md");
	assertEquals(agentMd.target, "../../prompt/BACKEND.md");

	const agentsDir = entries.find((e) => e.key === ".agents")!;
	assertEquals(agentsDir.target, "../../.agents");
});

Deno.test("TC-U102: re-exported getLinkableWorkspaces filters correctly", () => {
	const config: WorkspaceConfig = {
		workspaces: [
			{ url: "git@example.com:a/r1.git", path: "projects/r1", branch: "main", isGolang: false, active: true, link: { ".agents": ".agents" } },
			{ url: "git@example.com:a/r2.git", path: "projects/r2", branch: "main", isGolang: false, active: true },
			{ url: "git@example.com:a/r3.git", path: "projects/r3", branch: "main", isGolang: false, active: true, link: {} },
			{ url: "git@example.com:a/r4.git", path: "projects/r4", branch: "main", isGolang: false, active: false, link: { "x": "y" } },
		],
	};

	const linkable = getLinkableWorkspaces(config);

	assertEquals(linkable.length, 1);
	assertEquals(linkable[0].path, "projects/r1");
});

Deno.test("TC-U103: re-exported validateLinkMap validates correctly", () => {
	// Invalid: absolute path
	const badResult = validateLinkMap({ ".agents": "/absolute/path" });
	assertFalse(badResult.ok);
	if (!badResult.ok) {
		assertEquals(badResult.error.code, AppErrorCode.CONFIG_INVALID);
	}

	// Valid map
	const goodResult = validateLinkMap({ ".agents": ".agents", "AGENT.md": "prompt/BACKEND.md" });
	assert(goodResult.ok);
});

Deno.test("re-exported validateLinkPath rejects .. segments", () => {
	const result = validateLinkPath("../outside");
	assertFalse(result.ok);
	if (!result.ok) {
		assertEquals(result.error.code, AppErrorCode.CONFIG_INVALID);
	}
});
