import type { ReactNode } from "react";
import { Heading } from "../atoms/heading.js";

interface Row {
	label: string;
	value: string | number;
}

interface CardProps {
	rows: Row[];
	title: string;
}

// A summary card: a heading over an arbitrary body.
export function Card({
	title,
	fullWidth,
	children,
}: {
	children: ReactNode;
	fullWidth?: boolean;
	title: string;
}) {
	const classes = ["ov-card", fullWidth ? "full-width" : undefined]
		.filter(Boolean)
		.join(" ");
	return (
		<div className={classes}>
			<Heading level={3}>{title}</Heading>
			<div className="ov-card-body">{children}</div>
		</div>
	);
}

// A summary card whose body is a list of stat rows.
export function StatCard({ title, rows }: CardProps) {
	return (
		<Card title={title}>
			{rows.map((row) => (
				<div className="ov-stat-row" key={row.label}>
					<span className="ov-stat-label">{row.label}</span>
					<span className="ov-stat-value">{row.value}</span>
				</div>
			))}
		</Card>
	);
}

// A summary card whose body is the project info grid.
export function InfoCard({ title, rows }: CardProps) {
	return (
		<Card title={title}>
			<div className="ov-info-grid">
				{rows.map((row) => (
					<div className="ov-info-item" key={row.label}>
						{/* biome-ignore lint/a11y/noLabelWithoutControl: display-only label; the info-grid CSS keys on the tag */}
						<label>{row.label}</label>
						<span>{row.value}</span>
					</div>
				))}
			</div>
		</Card>
	);
}
