import { cli } from "./src/cli.ts";
import { Result } from "typescript-result";
import { red } from "@std/fmt/colors";

// Handle main execution
if (import.meta.main) {
	const result = await Result.fromAsyncCatching(() => cli.parse(Deno.args));
	if (!result.ok) {
		console.log(red("❌ CLI Error:"), result.error.message);
		Deno.exit(1);
	}
}
