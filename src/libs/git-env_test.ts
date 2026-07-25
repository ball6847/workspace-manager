import { assertEquals, assertFalse } from "@std/assert";
import { buildGitEnv, getSshSocketDir, MAX_SOCKET_DIR_LENGTH, SSH_CONTROL_PERSIST_SECONDS } from "./git-env.ts";

Deno.test("buildGitEnv injects GIT_SSH_COMMAND when unset", () => {
	const env = buildGitEnv({ USER: "u" });
	assertEquals(
		env["GIT_SSH_COMMAND"],
		`ssh -o ControlMaster=auto -o ControlPath=/tmp/wm-ssh-u/%C -o ControlPersist=${SSH_CONTROL_PERSIST_SECONDS}`,
	);
});

Deno.test("buildGitEnv preserves user GIT_SSH_COMMAND", () => {
	const env = buildGitEnv({ USER: "u", GIT_SSH_COMMAND: "ssh -i /key" });
	assertEquals(env["GIT_SSH_COMMAND"], "ssh -i /key");
});

Deno.test("buildGitEnv skips mux when no socket dir candidate exists", () => {
	const env = buildGitEnv({});
	assertFalse("GIT_SSH_COMMAND" in env);
});

Deno.test("buildGitEnv skips mux when socketDir is null even with candidates", () => {
	const env = buildGitEnv({ USER: "u" }, null);
	assertFalse("GIT_SSH_COMMAND" in env);
});

Deno.test("getSshSocketDir prefers short /tmp dir from USER", () => {
	assertEquals(getSshSocketDir({ USER: "ball6847", HOME: "/home/ball6847" }), "/tmp/wm-ssh-ball6847");
});

Deno.test("getSshSocketDir falls back to LOGNAME when USER unset", () => {
	assertEquals(getSshSocketDir({ LOGNAME: "u" }), "/tmp/wm-ssh-u");
});

Deno.test("getSshSocketDir sanitizes special characters in username", () => {
	assertEquals(getSshSocketDir({ USER: "weird user@corp" }), "/tmp/wm-ssh-weird-user-corp");
});

Deno.test("getSshSocketDir falls back to home-based dir when no username", () => {
	assertEquals(getSshSocketDir({ HOME: "/home/u" }), "/home/u/.ssh/wm");
});

Deno.test("getSshSocketDir uses USERPROFILE as home fallback", () => {
	assertEquals(getSshSocketDir({ USERPROFILE: "/users/u" }), "/users/u/.ssh/wm");
});

Deno.test("getSshSocketDir returns null when no candidate exists", () => {
	assertEquals(getSshSocketDir({}), null);
});

Deno.test("getSshSocketDir skips overlong candidates in order", () => {
	// Username so long that the /tmp candidate exceeds the limit; the
	// home-based fallback is short enough to be used instead.
	const longUser = "u".repeat(MAX_SOCKET_DIR_LENGTH);
	assertEquals(getSshSocketDir({ USER: longUser, HOME: "/home/u" }), "/home/u/.ssh/wm");
});

Deno.test("getSshSocketDir returns null when every candidate is too long", () => {
	const longUser = "u".repeat(MAX_SOCKET_DIR_LENGTH);
	const longHome = "/" + "h".repeat(MAX_SOCKET_DIR_LENGTH);
	assertEquals(getSshSocketDir({ USER: longUser, HOME: longHome }), null);
});

Deno.test("getSshSocketDir result always fits within the macOS socket path budget", () => {
	// 103 usable bytes - 41 ("/%C") - 23 ("." + temp suffix) = 39 max for dir.
	const dir = getSshSocketDir({ USER: "ball6847", HOME: "/Users/ball6847" });
	assertEquals(dir !== null && dir.length <= MAX_SOCKET_DIR_LENGTH, true);
});
