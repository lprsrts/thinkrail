import type {
	ExtensionHostServices,
	ExtensionQuery,
	ServerExtension,
} from "@thinkrail/extension-api/server";
import { CodedError } from "@thinkrail/shared/codedError";
import type { ExtensionDisabled } from "./inline";
import { type ServerExtensionEntry, serverExtensions } from "./registry";

export type ExtensionHostServicesFor = (extensionName: string) => ExtensionHostServices;

type QueryTable = Readonly<Record<string, ExtensionQuery>>;

function unknownQuery(message: string): CodedError {
	return new CodedError("UNKNOWN_EXTENSION_QUERY", message);
}

function parseRequest(request: unknown): { extension: string; method: string; params: unknown } {
	if (typeof request !== "object" || request === null) {
		throw unknownQuery("extension.query needs { extension, method }");
	}
	const { extension, method, params } = request as Record<string, unknown>;
	if (typeof extension !== "string" || typeof method !== "string") {
		throw unknownQuery("extension.query needs { extension, method }");
	}
	return { extension, method, params };
}

export function createExtensionQueries(options: {
	isDisabled: ExtensionDisabled;
	services: ExtensionHostServicesFor;
	entries?: readonly ServerExtensionEntry[];
}): (request: unknown) => Promise<unknown> {
	const entries = options.entries ?? serverExtensions;
	const tables = new Map<ServerExtension, QueryTable>();

	const tableOf = (extension: ServerExtension): QueryTable | undefined => {
		if (!extension.queries) return undefined;
		let table = tables.get(extension);
		if (!table) {
			table = extension.queries(options.services(extension.name));
			tables.set(extension, table);
		}
		return table;
	};

	return async (request) => {
		const { extension: name, method, params } = parseRequest(request);
		const extension = entries.find((entry) => entry.extension.name === name)?.extension;
		if (!extension) throw unknownQuery(`No extension named ${name}`);
		if (options.isDisabled(name)) {
			throw new CodedError("EXTENSION_DISABLED", `The ${name} extension is switched off`);
		}
		const table = tableOf(extension);
		const query = table && Object.hasOwn(table, method) ? table[method] : undefined;
		if (typeof query !== "function") throw unknownQuery(`${name} answers no query ${method}`);
		return await query(params);
	};
}
