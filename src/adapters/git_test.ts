import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { ensureSshSocketDir, GitManager, resetSocketDirStateForTests } from "./git.ts";

Deno.test("ensureSshSocketDir creates socket dir with 0700 on first call", async () => {
	resetSocketDirStateForTests();
	// Keep the temp HOME short: getSshSocketDir rejects overlong paths by design.
	const tempHome = await Deno.makeTempDir({ dir: "/tmp", prefix: "wmt" });
	try {
		// No USER/LOGNAME -> home-based fallback keeps the test hermetic.
		const dir = await ensureSshSocketDir(false, { HOME: tempHome });
		const expectedDir = join(tempHome, ".ssh", "wm");
		assertEquals(dir, expectedDir);

		const stat = await Deno.stat(expectedDir);
		assertEquals(stat.isDirectory, true);
		if (stat.mode != null) {
			assertEquals(stat.mode & 0o777, 0o700);
		}

		// Second call is a no-op and returns the same path.
		const dir2 = await ensureSshSocketDir();
		assertEquals(dir2, expectedDir);
	} finally {
		await Deno.remove(tempHome, { recursive: true });
	}
});

Deno.test("ensureSshSocketDir degrades gracefully when mkdir fails", async () => {
	resetSocketDirStateForTests();
	const tempHome = await Deno.makeTempDir();
	try {
		// Create a file at the .ssh path so recursive mkdir fails reliably
		// regardless of the user the tests run as.
		await Deno.writeTextFile(join(tempHome, ".ssh"), "");

		const dir = await ensureSshSocketDir(true, { HOME: tempHome });
		assertEquals(dir, null);
	} finally {
		await Deno.remove(tempHome, { recursive: true });
	}
});

Deno.test("GitManager still reports non-repository when socket dir creation fails", async () => {
	resetSocketDirStateForTests();
	const tempHome = await Deno.makeTempDir();
	const originalHome = Deno.env.get("HOME");
	Deno.env.set("HOME", tempHome);
	try {
		await Deno.writeTextFile(join(tempHome, ".ssh"), "");

		const git = new GitManager(tempHome, true);
		const result = await git.isRepository();
		assertEquals(result.ok, true);
		assertEquals(result.value, false);
	} finally {
		if (originalHome !== undefined) {
			Deno.env.set("HOME", originalHome);
		} else {
			Deno.env.delete("HOME");
		}
		await Deno.remove(tempHome, { recursive: true });
	}
});
