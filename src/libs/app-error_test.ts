import { assert, assertEquals, assertFalse } from "@std/assert";
import { AppError, appError, AppErrorCode, isAppError, wrapAppError } from "./app-error.ts";
import { ErrorWithCause, wrapError, wrapErrorResult } from "./errors.ts";

Deno.test("AppError constructs with code, message, cause, and context", () => {
	const cause = new Error("root cause");
	const err = new AppError(AppErrorCode.GIT_FAILED, "git failed", {
		cause,
		context: { repo: "foo" },
	});

	assertEquals(err.name, "AppError");
	assertEquals(err.code, "GIT_FAILED");
	assertEquals(err.message, "git failed");
	assertEquals(err.cause, cause);
	assertEquals(err.context, { repo: "foo" });
});

Deno.test("appError helper constructs AppError", () => {
	const err = appError(AppErrorCode.CONFIG_INVALID, "bad config");
	assert(err instanceof AppError);
	assertEquals(err.code, "CONFIG_INVALID");
	assertEquals(err.message, "bad config");
});

Deno.test("wrapAppError preserves cause and sets code", () => {
	const cause = new Error("underlying");
	const err = wrapAppError(AppErrorCode.CHECKOUT_FAILED, "checkout failed", cause, { url: "https://example.com" });

	assertEquals(err.code, "CHECKOUT_FAILED");
	assertEquals(err.message, "checkout failed");
	assertEquals(err.cause, cause);
	assertEquals(err.context, { url: "https://example.com" });
});

Deno.test("isAppError returns true for AppError and false otherwise", () => {
	assert(isAppError(new AppError(AppErrorCode.INTERNAL, "x")));
	assertFalse(isAppError(new Error("plain")));
	assertFalse(isAppError("string"));
	assertFalse(isAppError(null));
	assertFalse(isAppError(undefined));
});

Deno.test("ErrorWithCause is an AppError with INTERNAL code", () => {
	const cause = new Error("cause");
	const err = new ErrorWithCause("context", cause);

	assert(err instanceof AppError);
	assertEquals(err.code, "INTERNAL");
	assertEquals(err.message, "context");
	assertEquals(err.cause, cause);
});

Deno.test("wrapError returns AppError with INTERNAL code by default", () => {
	const cause = new Error("cause");
	const err = wrapError("context", cause);

	assert(err instanceof AppError);
	assertEquals(err.code, "INTERNAL");
	assertEquals(err.message, "context");
	assertEquals(err.cause, cause);
});

Deno.test("wrapError accepts explicit code", () => {
	const cause = new Error("cause");
	const err = wrapError("context", cause, AppErrorCode.GIT_FAILED);
	assertEquals(err.code, "GIT_FAILED");
});

Deno.test("wrapErrorResult yields AppError with INTERNAL", () => {
	const cause = new Error("cause");
	const result = wrapErrorResult("context", cause);

	assertFalse(result.ok);
	if (!result.ok) {
		assert(result.error instanceof AppError);
		assertEquals(result.error.code, "INTERNAL");
		assertEquals(result.error.message, "context");
		assertEquals(result.error.cause, cause);
	}
});
