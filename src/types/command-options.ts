export type BaseCommandOptions = {
	config?: string;
	workspaceRoot?: string;
	debug?: boolean;
};

export type ConcurrentCommandOptions = BaseCommandOptions & {
	concurrency?: number;
};
