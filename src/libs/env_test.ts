import { assertEquals } from "@std/assert";
import { getDefaultConcurrency } from "./env.ts";

Deno.test("getDefaultConcurrency: returns 8 when WM_CONCURRENCY is not set", () => {
	assertEquals(getDefaultConcurrency(), 8);
});

Deno.test("getDefaultConcurrency: parses WM_CONCURRENCY correctly when valid", async (t) => {
	// Save original
	const original = Deno.env.get("WM_CONCURRENCY");

	try {
		await t.step("valid positive integer", () => {
			Deno.env.set("WM_CONCURRENCY", "4");
			assertEquals(getDefaultConcurrency(), 4);
		});

		await t.step("large value", () => {
			Deno.env.set("WM_CONCURRENCY", "64");
			assertEquals(getDefaultConcurrency(), 64);
		});

		await t.step("value of 1", () => {
			Deno.env.set("WM_CONCURRENCY", "1");
			assertEquals(getDefaultConcurrency(), 1);
		});
	} finally {
		// Restore original
		if (original !== undefined) {
			Deno.env.set("WM_CONCURRENCY", original);
		} else {
			Deno.env.delete("WM_CONCURRENCY");
		}
	}
});

Deno.test("getDefaultConcurrency: falls back to 8 when WM_CONCURRENCY is invalid", async (t) => {
	const original = Deno.env.get("WM_CONCURRENCY");

	try {
		await t.step("non-numeric string", () => {
			Deno.env.set("WM_CONCURRENCY", "abc");
			assertEquals(getDefaultConcurrency(), 8);
		});

		await t.step("empty string", () => {
			Deno.env.set("WM_CONCURRENCY", "");
			assertEquals(getDefaultConcurrency(), 8);
		});

		await t.step("zero", () => {
			Deno.env.set("WM_CONCURRENCY", "0");
			assertEquals(getDefaultConcurrency(), 8);
		});

		await t.step("negative number", () => {
			Deno.env.set("WM_CONCURRENCY", "-2");
			assertEquals(getDefaultConcurrency(), 8);
		});

		await t.step("float string", () => {
			Deno.env.set("WM_CONCURRENCY", "4.5");
			assertEquals(getDefaultConcurrency(), 4); // parseInt truncates
		});
	} finally {
		if (original !== undefined) {
			Deno.env.set("WM_CONCURRENCY", original);
		} else {
			Deno.env.delete("WM_CONCURRENCY");
		}
	}
});
