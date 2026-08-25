"use client";

import { App } from "report-ui/app";
import { fixtureModel } from "report-ui/demo/fixture";

import "report-ui/styles.css";
import "@/app/globals.css";

export default function ReportPlayground() {
	return (
		<div className="mx-auto min-h-screen max-w-6xl">
			<p className="p-4 text-neutral-500 text-xs">
				dev playground — the same components the CLI embeds in its HTML report,
				fed with fixture data
			</p>
			<App model={fixtureModel()} />
		</div>
	);
}
