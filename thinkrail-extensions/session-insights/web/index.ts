import { RiArrowLeftRightLine, RiBarChartBoxLine, RiFlowChart } from "@remixicon/react";
import { defineWebExtension } from "@thinkrail/extension-api/web";
import { PANEL_COMMANDS, PANEL_SHORTCUTS } from "./keys";

export default defineWebExtension({
	name: "session-insights",
	title: "sessionInsights.panel.title",
	panels: {
		sessions: {
			title: "sessionInsights.panel.title",
			icon: RiBarChartBoxLine,
			scopes: ["project"],
			load: () => import("./SessionsPanel"),
		},
		session: {
			title: "sessionInsights.session.title",
			icon: RiFlowChart,
			scopes: ["session"],
			load: () => import("./session/SessionPanel"),
		},
		compare: {
			title: "sessionInsights.compare.title",
			icon: RiArrowLeftRightLine,
			scopes: ["session"],
			load: () => import("./compare/ComparePanel"),
		},
	},
	commands: PANEL_COMMANDS,
	shortcuts: PANEL_SHORTCUTS,
});
