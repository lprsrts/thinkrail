import { TranscriptBuilder } from "./builders.ts";

/** A call: the tool, its arguments, and whether it failed. */
export type Call = readonly [
	tool: string,
	args: Record<string, unknown>,
	failed?: boolean | undefined,
];

export const sh = (command: string, failed?: boolean): Call => ["bash", { command }, failed];
export const rd = (path: string): Call => ["read", { path }];
export const ed = (path: string, failed?: boolean): Call => ["edit", { path, edits: [] }, failed];
export const gr = (pattern: string): Call => ["grep", { pattern }];

/** A session of prompts, each followed by its calls one model call at a time. */
export function sessionOf(
	id: string,
	turns: readonly { prompt: string; calls: readonly Call[] }[],
	options: { cwd?: string; start?: number; model?: string; cost?: number } = {},
): TranscriptBuilder {
	const builder = new TranscriptBuilder({
		id,
		cwd: options.cwd ?? "/work/a",
		...(options.start !== undefined ? { start: options.start } : {}),
	});
	let n = 0;
	for (const turn of turns) {
		builder.user(turn.prompt);
		for (const [tool, args, failed] of turn.calls) {
			n += 1;
			const callId = `${id}-${n}`;
			builder.assistant({
				toolCalls: [{ id: callId, name: tool, arguments: args }],
				...(options.model ? { model: options.model } : {}),
				...(options.cost !== undefined
					? {
							usage: {
								input: 100,
								output: 10,
								cacheRead: 0,
								cacheWrite: 0,
								totalTokens: 110,
								cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: options.cost },
							},
						}
					: {}),
			});
			builder.toolResult({
				toolCallId: callId,
				toolName: tool,
				isError: failed === true,
				text: failed ? "Error: it failed\nCommand exited with code 1" : "ok",
			});
		}
		builder.assistant({ text: "Done." });
	}
	return builder;
}

/** Credentials under secret-named arguments of tools no label rule knows, nested ones included. */
export const SECRET_ARGS = {
	password: "customcredential0123456789",
	apiKey: "apikeycredential0123456789",
	dbPassword: "dbcredential0123456789",
	nested: "nestedcredential0123456789",
} as const;

/** Custom tools whose only or first string arguments are credentials; each call fails once and is retried. */
export const SECRET_CALLS: readonly Call[] = [
	["db_connect", { password: SECRET_ARGS.password, host: "db.local" }, true],
	["db_connect", { password: SECRET_ARGS.password, host: "db.local" }],
	["deploy_service", { apiKey: SECRET_ARGS.apiKey }],
	["set_env", { DB_PASSWORD: SECRET_ARGS.dbPassword }],
	["configure", { config: { auth: { password: SECRET_ARGS.nested } }, note: "staging" }],
];
