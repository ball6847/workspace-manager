import { Confirm } from "@cliffy/prompt";
import { Result } from "typescript-result";
import { AppError, AppErrorCode } from "../libs/app-error.ts";
import type { Confirmer } from "../ports/confirmer.ts";

export class CliffyConfirmer implements Confirmer {
	async confirm(message: string): Promise<Result<boolean, AppError>> {
		return await Result.fromAsyncCatching(async () => {
			return await Confirm.prompt({ message, default: false });
		}).mapError((error) => {
			if (error instanceof Error && error.message.includes("aborted")) {
				return new AppError(AppErrorCode.CANCELLED, "user cancelled confirmation", { cause: error });
			}
			return new AppError(AppErrorCode.INTERNAL, "confirmation prompt failed", { cause: error });
		});
	}
}
