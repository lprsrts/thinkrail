import type { ExtensionCatalogEntry, ExtensionQueryParams } from "@thinkrail/contracts";
import type { PanelHost, PanelHostScope, PanelToolCall } from "@thinkrail/extension-api/web";
import type { ReactNode } from "react";
import type { RegisteredPanel } from "../extensions";
import { extensionParamsKey, tupleKey } from "../lib";
import { type ChatLocationRequest, useAppStore } from "../store";
import { getTransport, RequestError, supportsExtensionQuery } from "../transport";

export interface PanelHostDeps {
	readonly extension: string;
	readonly request: (params: ExtensionQueryParams) => Promise<unknown>;
	readonly navigate: (workspace: { id: string; projectId: string }, sessionId: string) => void;
	/** Enters the location's workspace and asks its chat to reveal the location. */
	readonly locate: (location: ChatLocationRequest) => void;
	readonly openPanel: (
		panel: string,
		params: Readonly<Record<string, string>>,
		title: string | undefined,
	) => void;
	readonly renderToolCall: (call: PanelToolCall) => ReactNode;
	/** Enters the workspace when it is another one, then opens the file (at `line` when given). */
	readonly openFile: (workspaceId: string, path: string, line: number | undefined) => void;
	/** Reveals the Artifacts tool of the panel's workspace. */
	readonly openArtifacts: () => void;
	readonly scope: PanelHostScope;
	readonly hostProtocol: number | null;
	readonly hostApiVersion: number | undefined;
}

function abortReason(signal: AbortSignal): unknown {
	return signal.reason ?? new DOMException("The extension query was aborted", "AbortError");
}

export function createPanelHost(deps: PanelHostDeps): PanelHost {
	return {
		query(method, params, signal) {
			if (signal?.aborted) return Promise.reject(abortReason(signal));
			if (!supportsExtensionQuery(deps.hostProtocol)) {
				return Promise.reject(
					new RequestError("UNKNOWN_EXTENSION_QUERY", "The host predates extension queries"),
				);
			}
			const sent = deps.request({
				extension: deps.extension,
				method,
				...(params === undefined ? {} : { params }),
			});
			if (!signal) return sent;
			return new Promise((resolve, reject) => {
				const abort = () => reject(abortReason(signal));
				signal.addEventListener("abort", abort, { once: true });
				void sent.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
			});
		},
		openChat(target) {
			const { at } = target;
			if (!at) {
				deps.navigate({ id: target.workspaceId, projectId: target.projectId }, target.sessionId);
				return;
			}
			deps.locate({
				workspaceId: target.workspaceId,
				projectId: target.projectId,
				sessionId: target.sessionId,
				messageIndex: at.messageIndex,
				anchorText: at.anchorText,
				...(at.toolCallId ? { toolCallId: at.toolCallId } : {}),
				...(at.approximate ? { approximate: true } : {}),
			});
		},
		openPanel(panel, params = {}, title) {
			deps.openPanel(panel, params, title);
		},
		renderToolCall: (call) => deps.renderToolCall(call),
		openFile(workspaceId, path, line) {
			deps.openFile(workspaceId, path, line);
		},
		openArtifacts() {
			deps.openArtifacts();
		},
		scope: deps.scope,
		hostProtocol: deps.hostProtocol,
		hostApiVersion: deps.hostApiVersion,
	};
}

interface CatalogRead {
	readonly generation: number;
	readonly entries: Promise<readonly ExtensionCatalogEntry[]>;
	value?: readonly ExtensionCatalogEntry[];
}

let catalogRead: CatalogRead | null = null;

export function readExtensionCatalog(
	generation: number,
	list: () => Promise<readonly ExtensionCatalogEntry[]> = () =>
		getTransport().request("extension.list", {}),
): Promise<readonly ExtensionCatalogEntry[]> {
	if (catalogRead?.generation === generation) return catalogRead.entries;
	const read: CatalogRead = { generation, entries: list() };
	catalogRead = read;
	read.entries.then(
		(value) => {
			read.value = value;
		},
		() => {
			if (catalogRead === read) catalogRead = null;
		},
	);
	return read.entries;
}

export function cachedExtensionCatalog(
	generation: number,
): readonly ExtensionCatalogEntry[] | undefined {
	return catalogRead?.generation === generation ? catalogRead.value : undefined;
}

export function openExtensionPanel(
	workspaceId: string,
	panel: RegisteredPanel,
	params: Readonly<Record<string, string>> = {},
	title = "",
): void {
	useAppStore.getState().openDoc({
		kind: "extension",
		id: tupleKey(
			"extension",
			workspaceId,
			panel.extension,
			panel.panel,
			extensionParamsKey(params),
		),
		workspaceId,
		name: title,
		extension: panel.extension,
		panel: panel.panel,
		titleKey: panel.declaration.title,
		params: { ...params },
	});
}
