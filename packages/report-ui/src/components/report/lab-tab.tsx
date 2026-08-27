"use client";

import { useState } from "react";
import type { ReportArtifact, RuleExampleMap } from "@/lib/model/artifact";

interface LabTabProps {
	artifact: ReportArtifact;
}

const DEFAULT_CHECK = `// context: the scanned module graph, providers and diagnostics
function check(context) {
  const issues = [];
  for (const provider of context.providers ?? []) {
    if ((provider.publicMethodCount ?? 0) > 8) {
      issues.push(provider.name + " exposes " + provider.publicMethodCount + " public methods");
    }
  }
  return issues;
}`;

type RunResult = { ok: true; value: unknown } | { ok: false; error: string };

/** Runs a user check over the artifact with new Function — no sandbox, same
 * trust model as the CLI report today. */
export function LabTab({ artifact }: LabTabProps) {
	const [code, setCode] = useState(DEFAULT_CHECK);
	const [result, setResult] = useState<RunResult | null>(null);

	const run = () => {
		try {
			const fn = new Function(`return (${code});`)() as (
				context: unknown
			) => unknown;
			const context = {
				providers: artifact.providers,
				modules: artifact.graph.modules,
				diagnostics: artifact.diagnostics,
			};
			setResult({ ok: true, value: fn(context) });
		} catch (cause) {
			setResult({
				ok: false,
				error: cause instanceof Error ? cause.message : String(cause),
			});
		}
	};

	const presetNames = Object.keys(artifact.examples as RuleExampleMap);

	return (
		<section className="tab-panel">
			<div className="lab-grid">
				<textarea
					className="lab-editor"
					onChange={(e) => setCode(e.target.value)}
					rows={16}
					spellCheck={false}
					value={code}
				/>
				<div className="lab-output">
					<button className="primary" onClick={run} type="button">
						Run check
					</button>
					{presetNames.length > 0 && (
						<p className="panel-note">
							Examples bundled: {presetNames.join(", ")}
						</p>
					)}
					{result?.ok && (
						<pre className="lab-result">{stringify(result.value)}</pre>
					)}
					{result && !result.ok && (
						<pre className="lab-error">{result.error}</pre>
					)}
				</div>
			</div>
		</section>
	);
}

function stringify(value: unknown): string {
	if (value === undefined) {
		return "undefined";
	}
	if (typeof value === "string") {
		return value;
	}
	try {
		return JSON.stringify(value, null, 2) ?? String(value);
	} catch {
		return String(value);
	}
}
