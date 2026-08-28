"use client";

import {
	getReportHtml,
	getReportStyles,
	initialTab,
	labOpened,
	parseReportFile,
	type ReportArtifact,
	renderChrome,
	renderDiagnosis,
	renderEndpoints,
	renderLab,
	renderModules,
	renderSchema,
	renderSummary,
	resizeEndpoints,
	resizeModules,
	setActiveTab,
	setDiagnosisBadge,
	sharedHiddenTabs,
	sharedReportToArtifact,
	unmountAll,
} from "nestjs-doctor/report-ui";
import posthog from "posthog-js";
import { useEffect, useState } from "react";

const TAB_NAMES = [
	"summary",
	"diagnosis",
	"lab",
	"schema",
	"endpoints",
	"modules",
];

// The report beacon's allow-lists, so web events match the CLI report's.
const SECTIONS = new Set(TAB_NAMES);
const ACTIONS = new Set([
	"rule_lab_run",
	"rule_lab_preset_loaded",
	"rule_lab_scope_changed",
	"rule_lab_result_opened",
	"rule_lab_code_edited",
	"rule_lab_metadata_changed",
	"module_opened_from_finding",
	"module_opened_from_tree",
	"graph_recentered",
	"graph_zoomed",
	"graph_sidebar_toggled",
	"module_tree_expanded",
	"schema_tree_expanded",
	"endpoint_code_opened",
	"boot_trace_opened",
]);

interface ReportGlobals {
	__ndTrack?: (event: string) => void;
	dagre?: unknown;
	switchTab?: (name: string) => void;
}

type ViewerState =
	| { phase: "empty"; error?: string }
	| {
			phase: "loaded";
			artifact: ReportArtifact;
			hiddenTabs: string[];
			shared: boolean;
	  };

function track(event: string): void {
	if (!posthog.__loaded) {
		return;
	}
	if (SECTIONS.has(event)) {
		posthog.capture("report_section_viewed", { section: event, viewer: "web" });
	} else if (ACTIONS.has(event)) {
		posthog.capture("report_action", { section: event, viewer: "web" });
	}
}

function LoadedReport({
	artifact,
	hiddenTabs,
	shared,
	onLoadAnother,
}: {
	artifact: ReportArtifact;
	hiddenTabs: string[];
	shared: boolean;
	onLoadAnother: () => void;
}) {
	useEffect(() => {
		let disposed = false;
		let cleanupCodeViewer: (() => void) | undefined;
		const rendered: Record<string, boolean> = {};
		const g = globalThis as ReportGlobals;

		const switchTab = (name: string) => {
			setActiveTab(name);
			for (const tab of TAB_NAMES) {
				document
					.getElementById(`tab-${tab}`)
					?.classList.toggle("active", tab === name);
			}
			if (name === "summary" && !rendered.summary) {
				renderSummary(artifact);
				rendered.summary = true;
			}
			if (name === "diagnosis" && !rendered.diagnosis) {
				renderDiagnosis(artifact, { setDiagnosisBadge });
				rendered.diagnosis = true;
			}
			if (name === "lab" && !rendered.lab) {
				labOpened();
				rendered.lab = true;
			}
			if (name === "schema" && !rendered.schema) {
				renderSchema(artifact);
				rendered.schema = true;
			}
			if (name === "endpoints" && !rendered.endpoints) {
				renderEndpoints(artifact);
				rendered.endpoints = true;
			}
			if (name === "modules") {
				if (rendered.modules) {
					resizeModules();
				} else {
					renderModules(artifact);
					rendered.modules = true;
				}
			}
			if (name === "endpoints" && rendered.endpoints) {
				resizeEndpoints();
			}
		};

		g.switchTab = switchTab;
		g.__ndTrack = track;

		(async () => {
			const [codeViewer, dagre] = await Promise.all([
				import("./code-viewer"),
				import("dagre"),
			]);
			if (disposed) {
				return;
			}
			g.dagre = dagre.default ?? dagre;
			codeViewer.installCodeViewer();
			cleanupCodeViewer = codeViewer.uninstallCodeViewer;
			renderChrome(artifact, {
				hiddenTabs,
				hideShare: shared,
				onLoadAnother,
			});
			if (!hiddenTabs.includes("lab")) {
				renderLab(artifact);
				codeViewer.initLabEditor(track);
			}
			switchTab(initialTab(artifact, hiddenTabs));
			if (posthog.__loaded) {
				posthog.capture("report_opened", { viewer: "web", shared });
			}
		})();

		return () => {
			disposed = true;
			unmountAll();
			cleanupCodeViewer?.();
			g.switchTab = undefined;
			g.__ndTrack = undefined;
			g.dagre = undefined;
		};
	}, [artifact, hiddenTabs, shared, onLoadAnother]);

	return (
		<>
			<link href="https://fonts.googleapis.com" rel="preconnect" />
			<link crossOrigin="" href="https://fonts.gstatic.com" rel="preconnect" />
			<link
				href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@200;400;500;600;700&display=swap"
				precedence="default"
				rel="stylesheet"
			/>
			{/* biome-ignore lint/security/noDangerouslySetInnerHtml: the report's own stylesheet */}
			<style dangerouslySetInnerHTML={{ __html: getReportStyles() }} />
			{/* biome-ignore lint/security/noDangerouslySetInnerHtml: the report's static mount skeleton */}
			<div dangerouslySetInnerHTML={{ __html: getReportHtml() }} />
		</>
	);
}

export function ReportViewer() {
	const [state, setState] = useState<ViewerState>({ phase: "empty" });

	const openFile = async (file: File) => {
		const parsed = parseReportFile(await file.text());
		if (parsed.kind === "error") {
			setState({ phase: "empty", error: parsed.error });
			return;
		}
		if (parsed.kind === "shared") {
			setState({
				phase: "loaded",
				artifact: sharedReportToArtifact(parsed.shared),
				hiddenTabs: sharedHiddenTabs(parsed.shared),
				shared: true,
			});
			return;
		}
		setState({
			phase: "loaded",
			artifact: parsed.artifact,
			hiddenTabs: [],
			shared: false,
		});
	};

	if (state.phase === "loaded") {
		return (
			<LoadedReport
				artifact={state.artifact}
				hiddenTabs={state.hiddenTabs}
				onLoadAnother={() => setState({ phase: "empty" })}
				shared={state.shared}
			/>
		);
	}

	return (
		<main className="flex min-h-dvh flex-col items-center justify-center bg-black px-6 py-16 font-mono text-white">
			<div className="w-full max-w-xl">
				<p className="mb-8 text-neutral-500 text-sm">
					<a className="hover:text-white" href="/">
						nestjs.doctor
					</a>
					<span className="mx-2">/</span>
					<span className="text-white">report viewer</span>
				</p>
				<h1 className="mb-3 font-semibold text-2xl">Open a report</h1>
				<p className="mb-8 text-neutral-400 text-sm leading-relaxed">
					Load a full report (
					<code className="text-neutral-200">--format report-json</code>) or a
					shared file downloaded from a report&apos;s share dialog. The file is
					read in your browser and never uploaded.
				</p>
				{/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: the label wraps the file input and takes drops */}
				<label
					className="block cursor-pointer border border-neutral-700 border-dashed px-6 py-12 text-center transition-colors hover:border-neutral-400"
					onDragOver={(e) => e.preventDefault()}
					onDrop={(e) => {
						e.preventDefault();
						const file = e.dataTransfer.files[0];
						if (file) {
							openFile(file);
						}
					}}
				>
					<span className="block text-neutral-300 text-sm">
						Drop a report file here
					</span>
					<span className="mt-2 block text-neutral-500 text-xs">
						or click to choose one
					</span>
					<input
						accept=".json,application/json"
						className="sr-only"
						onChange={(e) => {
							const file = e.target.files?.[0];
							if (file) {
								openFile(file);
							}
							e.target.value = "";
						}}
						type="file"
					/>
				</label>
				{state.error && (
					<p className="mt-4 text-red-400 text-sm">{state.error}</p>
				)}
				<p className="mt-8 text-neutral-600 text-xs leading-relaxed">
					Generate a report with{" "}
					<code className="text-neutral-400">
						npx -y nestjs-doctor@latest . --format report-json
					</code>
				</p>
			</div>
		</main>
	);
}
