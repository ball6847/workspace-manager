import { join } from "@std/path";

/** Prefix of the per-user multiplex socket directory under /tmp. */
export const SSH_SOCKET_TMP_PREFIX = "/tmp/wm-ssh-";

/** Directory name under ~/.ssh used as the fallback socket dir. */
export const SSH_SOCKET_HOME_DIR_NAME = "wm";

/** How long (in seconds) OpenSSH keeps an idle ControlMaster alive. */
export const SSH_CONTROL_PERSIST_SECONDS = 60;

/**
 * Maximum allowed length for the socket directory path.
 *
 * macOS limits Unix domain socket paths to 104 bytes (103 usable). ssh
 * appends "/%C" (41 chars) plus a "." + ~22-char temporary listener suffix
 * to the ControlPath, so the directory itself must stay well under the
 * limit: 103 - 64 = 39; we use 38 for headroom.
 */
export const MAX_SOCKET_DIR_LENGTH = 38;

function sanitizeUser(user: string): string {
	return user.replace(/[^A-Za-z0-9_-]/g, "-");
}

/**
 * Build the path to the SSH multiplex socket directory.
 *
 * Candidates, in order:
 * 1. `/tmp/wm-ssh-<user>` — short enough for the macOS socket path limit
 *    even with long usernames/home dirs (uses `USER`/`LOGNAME`, sanitized).
 * 2. `<home>/.ssh/wm` — fallback when no username is available.
 *
 * Returns `null` when no candidate fits within {@link MAX_SOCKET_DIR_LENGTH}
 * (caller should then skip mux). Candidates that are too long are skipped in
 * order.
 */
export function getSshSocketDir(env: Record<string, string | undefined>): string | null {
	const candidates: string[] = [];

	const user = env["USER"] ?? env["LOGNAME"];
	if (user) {
		const sanitized = sanitizeUser(user);
		if (sanitized.length > 0) {
			candidates.push(`${SSH_SOCKET_TMP_PREFIX}${sanitized}`);
		}
	}

	const home = env["HOME"] ?? env["USERPROFILE"];
	if (home) {
		candidates.push(join(home, ".ssh", SSH_SOCKET_HOME_DIR_NAME));
	}

	for (const dir of candidates) {
		if (dir.length <= MAX_SOCKET_DIR_LENGTH) {
			return dir;
		}
	}
	return null;
}

/**
 * Build the environment passed to every git subprocess.
 *
 * If the user already provided `GIT_SSH_COMMAND` it is preserved verbatim.
 * Otherwise, when a socket directory is available, the returned env injects
 * `GIT_SSH_COMMAND` with OpenSSH ControlMaster options pointing at the
 * tool-managed socket directory.
 *
 * `socketDir` is normally derived from `env` but may be supplied explicitly by
 * the caller (e.g. after it has ensured the directory exists). Passing `null`
 * disables mux even when a candidate is present.
 */
export function buildGitEnv(
	env: Record<string, string | undefined>,
	socketDir: string | null = getSshSocketDir(env),
): Record<string, string> {
	if (env["GIT_SSH_COMMAND"]) {
		return env as Record<string, string>;
	}
	if (!socketDir) {
		return env as Record<string, string>;
	}
	return {
		...env,
		GIT_SSH_COMMAND: `ssh -o ControlMaster=auto -o ControlPath=${socketDir}/%C -o ControlPersist=${SSH_CONTROL_PERSIST_SECONDS}`,
	} as Record<string, string>;
}
