/**
 * Get default concurrency from WM_CONCURRENCY environment variable.
 * Falls back to 8 if not set or invalid.
 * Minimum value is 1.
 */
export function getDefaultConcurrency(): number {
	const envValue = Deno.env.get("WM_CONCURRENCY");
	if (envValue === undefined) {
		return 8;
	}

	const parsed = parseInt(envValue, 10);
	if (isNaN(parsed) || parsed < 1) {
		return 8;
	}

	return parsed;
}
