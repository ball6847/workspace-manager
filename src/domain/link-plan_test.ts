import { assert, assertEquals, assertFalse } from "@std/assert";
import { AppErrorCode } from "../libs/app-error.ts";
import { buildLinkEntries, getLinkableWorkspaces, validateLinkMap, validateLinkPath } from "./link-plan.ts";
import type { WorkspaceConfig, WorkspaceConfigItem } from "../types/config.ts";

Deno.test("TC-101: validateLinkPath rejects unsafe paths", () => {
	const unsafe = ["", "   ", "/etc/passwd", "../outside", "a/../../b", "C:\\abs"];
	for (const p of unsafe) {
		const result = validateLinkPath(p);
		assertFalse(result.ok, `expected error for path: ${JSON.stringify(p)}`);
		if (!result.ok) {
			assertEquals(result.error.code, AppErrorCode.CONFIG_INVALID);
		}
	}
});

Deno.test("TC-101: validateLinkPath accepts safe relative paths", () => {
	const safe = [".agents", "AGENT.md", "config/deep/AGENT.md", "a/./b"];
	for (const p of safe) {
		const result = validateLinkPath(p);
		assert(result.ok, `expected ok for path: ${JSON.stringify(p)}`);
	}
});

Deno.test("TC-102: getLinkableWorkspaces filters active workspaces with non-empty link map", () => {
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

Deno.test("TC-103: buildLinkEntries computes correct relative targets", () => {
	const workspace: WorkspaceConfigItem = {
		url: "git@example.com:org/repo.git",
		path: "projects/repo1",
		branch: "main",
		isGolang: false,
		active: true,
		link: {
			"AGENT.md": "prompt/BACKEND.md",
			".agents": ".agents",
			"config/deep/AGENT.md": "prompt/BACKEND.md",
		},
	};

	const entries = buildLinkEntries("/ws", workspace);

	assertEquals(entries.length, 3);

	const agentMd = entries.find((e) => e.key === "AGENT.md")!;
	assertEquals(agentMd.source, "/ws/prompt/BACKEND.md");
	assertEquals(agentMd.destination, "/ws/projects/repo1/AGENT.md");
	assertEquals(agentMd.target, "../../prompt/BACKEND.md");

	const agentsDir = entries.find((e) => e.key === ".agents")!;
	assertEquals(agentsDir.target, "../../.agents");

	const deep = entries.find((e) => e.key === "config/deep/AGENT.md")!;
	assertEquals(deep.target, "../../../../prompt/BACKEND.md");
});

Deno.test("validateLinkMap rejects first violation and fails fast", () => {
	const result = validateLinkMap({ ".agents": "/absolute/path" });
	assertFalse(result.ok);
	if (!result.ok) {
		assertEquals(result.error.code, AppErrorCode.CONFIG_INVALID);
	}
});

Deno.test("validateLinkMap accepts valid map", () => {
	const result = validateLinkMap({ ".agents": ".agents", "AGENT.md": "prompt/BACKEND.md" });
	assert(result.ok);
});
