import type { RefObject } from "react";

export interface HoverCardData {
	/** Dim second line under the names, e.g. the module the class lives in. */
	context: string;
	/** The line under the title: the number, then a dim note after it. */
	detail: { dim: string; main: string };
	from: { color: string; label: string };
	/** Bold body line, e.g. what the span measures. */
	title: string;
	to?: { color: string; label: string };
}

interface HoverCardProps {
	cardRef: RefObject<HTMLDivElement | null>;
	data: HoverCardData | null;
	/** The thin line from the pointer to the card's corner. */
	tetherRef: RefObject<HTMLDivElement | null>;
}

function Name({ color, label }: { color: string; label: string }) {
	return (
		<span className="hover-card-name">
			<span className="hover-card-dot" style={{ background: color }} />
			{label}
		</span>
	);
}

// A card that rides the pointer over a bar, the way a trace waterfall
// names a span: who and where up top, what and how long below. The owner
// positions it and its tether through the refs on every mouse move.
export function HoverCard({ cardRef, data, tetherRef }: HoverCardProps) {
	return (
		<>
			<div
				className="hover-card-tether"
				hidden={data === null}
				ref={tetherRef}
			/>
			<div className="hover-card" hidden={data === null} ref={cardRef}>
				{data && (
					<>
						<div className="hover-card-head">
							<div className="hover-card-names">
								<Name {...data.from} />
								{data.to && (
									<>
										<span className="hover-card-arrow">→</span>
										<Name {...data.to} />
									</>
								)}
							</div>
							<div className="hover-card-context">{data.context}</div>
						</div>
						<div className="hover-card-body">
							<div className="hover-card-title">{data.title}</div>
							<div className="hover-card-detail">
								{data.detail.main}{" "}
								<span className="hover-card-dim">{data.detail.dim}</span>
							</div>
						</div>
					</>
				)}
			</div>
		</>
	);
}
