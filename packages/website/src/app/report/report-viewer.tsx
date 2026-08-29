"use client";

import {
	getReportHtml,
	getReportStyles,
	initialTab,
	labOpened,
	parseReportFile,
	type ReportArtifact,
	renderBoot,
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
import { useCallback, useEffect, useState } from "react";

const NO_HIDDEN_TABS: string[] = [];

const TAB_NAMES = [
	"summary",
	"diagnosis",
	"lab",
	"schema",
	"endpoints",
	"modules",
	"boot",
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
	"boot_span_selected",
]);

interface ReportGlobals {
	__ndTrack?: (event: string) => void;
	dagre?: unknown;
	switchTab?: (name: string) => void;
}

type ViewerState =
	| { phase: "picker"; error?: string }
	| { phase: "example" }
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
	demo,
	hiddenTabs,
	shared,
	onLoadAnother,
}: {
	artifact: ReportArtifact;
	demo?: boolean;
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
			if (name === "boot" && !rendered.boot) {
				renderBoot(artifact);
				rendered.boot = true;
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
				posthog.capture("report_opened", {
					viewer: "web",
					shared,
					demo: demo === true,
				});
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
	}, [artifact, hiddenTabs, shared, demo, onLoadAnother]);

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

function PickerModal({
	error,
	onClose,
	onFile,
}: {
	error?: string;
	onClose?: () => void;
	onFile: (file: File) => void;
}) {
	useEffect(() => {
		if (!onClose) {
			return;
		}
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose();
			}
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [onClose]);

	return (
		// The report page's own stylesheet resets margins on every element, so
		// the modal styles itself inline to stay independent of it.
		// biome-ignore lint/a11y/noStaticElementInteractions: clicking the backdrop reveals the example
		// biome-ignore lint/a11y/noNoninteractiveElementInteractions: clicking the backdrop reveals the example
		// biome-ignore lint/a11y/useKeyWithClickEvents: Escape already closes the overlay
		<div
			onClick={(e) => {
				if (e.target === e.currentTarget) {
					onClose?.();
				}
			}}
			style={{
				alignItems: "center",
				backdropFilter: "blur(2px)",
				background: "rgba(0,0,0,0.7)",
				display: "flex",
				fontFamily:
					'"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
				inset: 0,
				justifyContent: "center",
				padding: 24,
				position: "fixed",
				zIndex: 9999,
			}}
		>
			<div
				style={{
					background: "#000",
					border: "1px solid #404040",
					boxShadow: "0 25px 50px -12px rgba(0,0,0,0.9)",
					color: "#fff",
					maxWidth: 576,
					padding: 32,
					width: "100%",
				}}
			>
				<p style={{ color: "#737373", fontSize: 12, marginBottom: 24 }}>
					<a href="/" style={{ color: "#737373", textDecoration: "none" }}>
						nestjs.doctor
					</a>
					<span style={{ margin: "0 8px" }}>/</span>
					<span style={{ color: "#d4d4d4" }}>report viewer</span>
				</p>
				<h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>
					Open a report
				</h1>
				<p
					style={{
						color: "#a3a3a3",
						fontSize: 14,
						lineHeight: 1.6,
						marginBottom: 8,
					}}
				>
					Drop the shared file a teammate sent you.
				</p>
				<p
					style={{
						color: "#a3a3a3",
						fontSize: 14,
						lineHeight: 1.6,
						marginBottom: 16,
					}}
				>
					You can download it from a report&apos;s{" "}
					<span style={{ color: "#e5e5e5" }}>share</span> button, or generate
					the report locally with the command:
				</p>
				<pre
					style={{
						background: "#0a0a0a",
						border: "1px solid #262626",
						color: "#d4d4d4",
						fontSize: 12,
						marginBottom: 24,
						overflowX: "auto",
						padding: "12px 16px",
					}}
				>
					npx nestjs-doctor@latest .
				</pre>
				{/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: the label wraps the file input and takes drops */}
				<label
					onDragOver={(e) => e.preventDefault()}
					onDrop={(e) => {
						e.preventDefault();
						const file = e.dataTransfer.files[0];
						if (file) {
							onFile(file);
						}
					}}
					style={{
						border: "1px dashed #404040",
						cursor: "pointer",
						display: "block",
						padding: "40px 24px",
						textAlign: "center",
					}}
				>
					<span style={{ color: "#d4d4d4", display: "block", fontSize: 14 }}>
						Drop a report file here
					</span>
					<span
						style={{
							color: "#737373",
							display: "block",
							fontSize: 12,
							marginTop: 8,
						}}
					>
						or click to choose one
					</span>
					<input
						accept=".json,application/json"
						onChange={(e) => {
							const file = e.target.files?.[0];
							if (file) {
								onFile(file);
							}
							e.target.value = "";
						}}
						style={{
							height: 1,
							opacity: 0,
							overflow: "hidden",
							position: "absolute",
							width: 1,
						}}
						type="file"
					/>
				</label>
				{error && (
					<p style={{ color: "#f87171", fontSize: 14, marginTop: 16 }}>
						{error}
					</p>
				)}
				{onClose && (
					<button
						onClick={onClose}
						style={{
							background: "transparent",
							border: "1px solid #404040",
							color: "#d4d4d4",
							cursor: "pointer",
							display: "block",
							fontFamily: "inherit",
							fontSize: 14,
							marginTop: 24,
							padding: "10px 16px",
							textAlign: "center",
							width: "100%",
						}}
						type="button"
					>
						or explore the example report behind this window
					</button>
				)}
				<p
					style={{
						color: "#525252",
						fontSize: 12,
						lineHeight: 1.6,
						marginTop: 24,
					}}
				>
					Everything is read in your browser and never uploaded.
				</p>
				<p
					style={{
						color: "#525252",
						fontSize: 11,
						lineHeight: 1.6,
						marginTop: 6,
					}}
				>
					The full report as a file:{" "}
					<code style={{ color: "#737373" }}>--format report-json</code>
				</p>
			</div>
		</div>
	);
}

export function ReportViewer() {
	const [state, setState] = useState<ViewerState>({ phase: "picker" });
	const [demo, setDemo] = useState<ReportArtifact | null>(null);
	const [fileNonce, setFileNonce] = useState(0);

	useEffect(() => {
		let cancelled = false;
		fetch("/demo-report.json")
			.then((res) => (res.ok ? res.text() : Promise.reject(res.status)))
			.then((text) => {
				const parsed = parseReportFile(text);
				if (!cancelled && parsed.kind === "artifact") {
					setDemo(parsed.artifact);
				}
			})
			.catch(() => undefined);
		return () => {
			cancelled = true;
		};
	}, []);

	const openPicker = useCallback(() => setState({ phase: "picker" }), []);

	const openFile = async (file: File) => {
		const parsed = parseReportFile(await file.text());
		if (parsed.kind === "error") {
			setState({ phase: "picker", error: parsed.error });
			return;
		}
		setFileNonce((n) => n + 1);
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

	return (
		<div className="min-h-dvh bg-black">
			{state.phase === "loaded" ? (
				<LoadedReport
					artifact={state.artifact}
					hiddenTabs={state.hiddenTabs}
					key={`file-${fileNonce}`}
					onLoadAnother={openPicker}
					shared={state.shared}
				/>
			) : (
				demo && (
					<LoadedReport
						artifact={demo}
						demo
						hiddenTabs={NO_HIDDEN_TABS}
						key="demo"
						onLoadAnother={openPicker}
						shared={false}
					/>
				)
			)}
			{state.phase === "picker" && (
				<PickerModal
					error={state.error}
					onClose={demo ? () => setState({ phase: "example" }) : undefined}
					onFile={openFile}
				/>
			)}
		</div>
	);
}
