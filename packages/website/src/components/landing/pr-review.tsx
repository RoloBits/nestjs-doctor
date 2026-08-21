import { Figure, Section } from "./primitives";

const G = {
	bg: "#0d1117",
	bg2: "#161b22",
	border: "#30363d",
	borderSoft: "#21262d",
	mut: "#8b949e",
	blue: "#58a6ff",
} as const;

const Avatar = () => (
	<span
		className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full font-bold text-[#1b1207] text-[8px]"
		style={{ background: "#d97757" }}
	>
		nd
	</span>
);

const BotName = ({ children }: { children?: React.ReactNode }) => (
	<>
		<Avatar />
		<b className="font-semibold text-[#e6edf3]">nestjs-doctor</b>
		<span
			className="rounded-full border px-1.5 text-[10px]"
			style={{ borderColor: G.border, color: G.mut }}
		>
			bot
		</span>
		{children}
	</>
);

const Severity = ({ level }: { level: "error" | "warning" }) => {
	const style =
		level === "error"
			? {
					background: "rgba(248,81,73,0.12)",
					borderColor: "rgba(248,81,73,0.4)",
					color: "#f85149",
				}
			: {
					background: "rgba(210,153,34,0.12)",
					borderColor: "rgba(210,153,34,0.4)",
					color: "#d29922",
				};
	return (
		<span
			className="inline-block rounded-full border px-2 font-semibold text-[10px] uppercase tracking-[0.04em]"
			style={style}
		>
			{level}
		</span>
	);
};

const FINDINGS = [
	{
		level: "error" as const,
		text: "Hardcoded JWT secret",
		loc: "auth.service.ts:34",
	},
	{
		level: "warning" as const,
		text: "Controller injects ORM PrismaService directly",
		loc: "orders.controller.ts:11",
	},
];

const PullRequestMock = () => (
	<Figure caption="Fig. 02 — Pull request review" meta="delta vs base branch">
		<div
			className="font-sans text-[12px] leading-normal tracking-normal"
			style={{ background: G.bg, color: "#e6edf3" }}
		>
			<div
				className="border-b px-3.5 pt-3 pb-2.5"
				style={{ borderColor: G.border }}
			>
				<h3 className="m-0 mb-2 font-normal text-[17px] leading-tight">
					Add order payment webhook{" "}
					<span className="font-light" style={{ color: G.mut }}>
						#412
					</span>
				</h3>
				<div
					className="flex flex-wrap items-center gap-2"
					style={{ color: G.mut }}
				>
					<span
						className="rounded-full px-2.5 py-0.5 font-medium text-[11px] text-white"
						style={{ background: "#238636" }}
					>
						Open
					</span>
					<span>
						<b className="font-semibold text-[#e6edf3]">maria-dev</b> wants to
						merge 3 commits into{" "}
						<code className="rounded bg-white/10 px-1.5 py-px font-mono text-[#e6edf3] text-[11px]">
							main
						</code>{" "}
						from{" "}
						<code className="rounded bg-white/10 px-1.5 py-px font-mono text-[#e6edf3] text-[11px]">
							feat/payment-webhook
						</code>
					</span>
				</div>
			</div>

			<div
				className="flex gap-0.5 border-b px-2.5"
				style={{ borderColor: G.border }}
			>
				{[
					{ label: "Conversation", count: 4, on: true },
					{ label: "Commits", count: 3, on: false },
					{ label: "Files changed", count: 6, on: false },
				].map((tab) => (
					<span
						className={`border-b-2 px-2.5 py-1.5 ${tab.on ? "font-semibold text-[#e6edf3]" : ""}`}
						key={tab.label}
						style={{
							borderColor: tab.on ? "#f78166" : "transparent",
							color: tab.on ? undefined : G.mut,
						}}
					>
						{tab.label}{" "}
						<em className="rounded-full bg-white/10 px-1.5 text-[11px] not-italic">
							{tab.count}
						</em>
					</span>
				))}
			</div>

			<div className="grid gap-3 p-3">
				<div
					className="overflow-hidden rounded-md border"
					style={{ borderColor: G.border }}
				>
					<div
						className="flex flex-wrap items-center gap-1.5 border-b px-3 py-1.5"
						style={{ background: G.bg2, borderColor: G.border, color: G.mut }}
					>
						<BotName>
							<span>commented 2 minutes ago · edited on every push</span>
						</BotName>
					</div>
					<div className="px-3 py-3">
						<div className="mb-3 flex flex-wrap items-baseline gap-2">
							<span className="text-[14px]" style={{ color: G.mut }}>
								84
							</span>
							<span style={{ color: G.mut }}>→</span>
							<span
								className="font-semibold text-[23px] leading-none"
								style={{ color: "#f85149" }}
							>
								79
							</span>
							<span
								className="rounded-full border px-1.5 font-semibold text-[11px]"
								style={{
									background: "rgba(248,81,73,0.1)",
									borderColor: "rgba(248,81,73,0.4)",
									color: "#f85149",
								}}
							>
								−5
							</span>
							<span style={{ color: G.mut }}>/ 100 · below the 80 gate</span>
						</div>

						<table
							className="w-full table-auto border-collapse overflow-hidden rounded-md border text-[12px]"
							style={{ borderColor: G.border }}
						>
							<thead>
								<tr>
									{["Severity", "Finding", "Location"].map((head) => (
										<th
											className="border-b px-2.5 py-1.5 text-left font-semibold text-[11px]"
											key={head}
											style={{
												background: G.bg2,
												borderColor: G.border,
												color: G.mut,
											}}
										>
											{head}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{FINDINGS.map((finding, index) => (
									<tr key={finding.loc}>
										<td
											className="px-2.5 py-1.5"
											style={{
												borderBottom:
													index === 0 ? `1px solid ${G.borderSoft}` : undefined,
											}}
										>
											<Severity level={finding.level} />
										</td>
										<td
											className="px-2.5 py-1.5"
											style={{
												borderBottom:
													index === 0 ? `1px solid ${G.borderSoft}` : undefined,
											}}
										>
											{finding.text}
										</td>
										<td
											className="w-px whitespace-nowrap px-2.5 py-1.5 font-mono text-[11px]"
											style={{
												borderBottom:
													index === 0 ? `1px solid ${G.borderSoft}` : undefined,
												color: G.mut,
											}}
										>
											{finding.loc}
										</td>
									</tr>
								))}
							</tbody>
						</table>
						<p className="mt-2.5 mb-0 text-[11px]" style={{ color: G.mut }}>
							2 findings introduced by this PR · 6 pre-existing findings not
							shown
						</p>
					</div>
				</div>

				<div
					className="overflow-hidden rounded-md border"
					style={{ borderColor: G.border }}
				>
					<div
						className="flex flex-wrap items-center gap-1.5 border-b px-3 py-1.5"
						style={{ background: G.bg2, borderColor: G.border, color: G.mut }}
					>
						<BotName>
							<span>commented on</span>
							<a
								className="font-mono no-underline"
								href="#diff"
								style={{ color: G.blue }}
							>
								src/orders/orders.controller.ts
							</a>
						</BotName>
					</div>
					<div className="font-mono text-[11px] leading-[1.8]">
						<div
							className="flex"
							style={{ background: "rgba(56,139,253,0.1)", color: G.mut }}
						>
							<span className="w-[34px] shrink-0" />
							<span className="whitespace-pre px-2.5">
								@@ -8,5 +8,7 @@ export class OrdersController {"{"}
							</span>
						</div>
						<div className="flex">
							<span
								className="w-[34px] shrink-0 select-none border-r pr-2 text-right text-[#e6edf3]"
								style={{
									background: "rgba(46,160,67,0.3)",
									borderColor: G.borderSoft,
								}}
							>
								10
							</span>
							<span
								className="whitespace-pre px-2.5"
								style={{ background: "rgba(46,160,67,0.15)" }}
							>
								+ private readonly prisma: PrismaService,
							</span>
						</div>
					</div>
					<div
						className="border-t px-3 py-2.5"
						style={{ borderColor: G.border }}
					>
						<Severity level="warning" />{" "}
						<code className="rounded bg-white/10 px-1.5 py-px font-mono text-[11px]">
							architecture/no-orm-in-controller
						</code>
						<p className="mt-2 mb-0">
							Controller injects ORM{" "}
							<code className="rounded bg-white/10 px-1.5 py-px font-mono text-[11px]">
								PrismaService
							</code>{" "}
							directly. Route data access through{" "}
							<code className="rounded bg-white/10 px-1.5 py-px font-mono text-[11px]">
								OrdersService
							</code>
							.
						</p>
					</div>
				</div>

				<div
					className="overflow-hidden rounded-md border"
					style={{ borderColor: G.border }}
				>
					<div className="flex items-center gap-2 px-3 py-2">
						<span
							className="w-3.5 shrink-0 text-center font-bold"
							style={{ color: "#3fb950" }}
						>
							✓
						</span>
						<b className="font-semibold text-[#e6edf3]">test</b>
						<span style={{ color: G.mut }}>— 214 passed in 38s</span>
						<a
							className="ml-auto no-underline"
							href="#run"
							style={{ color: G.blue }}
						>
							Details
						</a>
					</div>
					<div
						className="flex items-center gap-2 border-t px-3 py-2"
						style={{ borderColor: G.border }}
					>
						<span
							className="w-3.5 shrink-0 text-center font-bold"
							style={{ color: "#f85149" }}
						>
							✕
						</span>
						<b className="font-semibold text-[#e6edf3]">nestjs-doctor / scan</b>
						<span style={{ color: G.mut }}>
							— score 79 is below the 80 gate
						</span>
						<a
							className="ml-auto no-underline"
							href="#run"
							style={{ color: G.blue }}
						>
							Details
						</a>
					</div>
				</div>

				<div className="flex items-center gap-2.5 px-px pb-1">
					<span
						className="rounded-md border px-3 py-1 font-semibold"
						style={{
							background: "rgba(248,81,73,0.1)",
							borderColor: "rgba(248,81,73,0.4)",
							color: "#f85149",
						}}
					>
						Merging is blocked
					</span>
					<span style={{ color: G.mut }}>1 required check failing</span>
				</div>
			</div>
		</div>
	</Figure>
);

export const PrReview = () => (
	<Section
		command="npx nestjs-doctor@latest ci install"
		copy={
			<>
				<p>
					Runs as a required check. It comments on the issues the pull request
					introduces, and blocks at the severity you choose.
				</p>
				<p>
					<a
						className="text-nest-red underline underline-offset-4"
						href="/docs/ci"
					>
						CI docs →
					</a>
				</p>
			</>
		}
		figure={<PullRequestMock />}
		figureLeft
		title="Reviews only what the PR introduced."
	/>
);
