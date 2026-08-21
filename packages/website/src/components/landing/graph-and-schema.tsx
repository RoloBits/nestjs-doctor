import { Figure, SectionPair } from "./primitives";

const BODY = "relative h-[280px]";

/* ---------- module graph ---------- */

const NODES = [
	{ name: "AppModule", x: 50, y: 14, tone: "root" },
	{ name: "AuthModule", x: 18, y: 44, tone: "cycle" },
	{ name: "UsersModule", x: 50, y: 44, tone: "cycle" },
	{ name: "OrdersModule", x: 82, y: 44, tone: "plain" },
	{ name: "NotificationsModule", x: 30, y: 78, tone: "plain" },
	{ name: "PrismaModule", x: 70, y: 78, tone: "cycle" },
] as const;

const EDGES = [
	{ from: 0, to: 1, cycle: false },
	{ from: 0, to: 2, cycle: false },
	{ from: 0, to: 3, cycle: false },
	{ from: 1, to: 2, cycle: true },
	{ from: 2, to: 5, cycle: true },
	{ from: 5, to: 1, cycle: true },
	{ from: 3, to: 5, cycle: false },
	{ from: 2, to: 4, cycle: false },
] as const;

const TONE = {
	cycle: "border-nest-red bg-black text-nest-red",
	plain: "border-white/30 bg-black text-white/[0.92]",
	root: "border-white bg-white text-black",
} as const;

const BOOT = [
	{
		name: "PrismaService",
		hook: "onModuleInit",
		ms: "812ms",
		width: 100,
		hot: true,
	},
	{
		name: "AuthModule",
		hook: "onApplicationBootstrap",
		ms: "96ms",
		width: 12,
		hot: false,
	},
	{
		name: "CacheService",
		hook: "onModuleInit",
		ms: "41ms",
		width: 5,
		hot: false,
	},
];

const ModuleGraph = () => (
	<Figure caption="Fig. 03 — Module graph" meta="6 modules · 1 cycle">
		<div className={BODY}>
			<svg
				aria-hidden="true"
				className="absolute inset-0 h-full w-full"
				focusable="false"
			>
				{EDGES.map((edge) => {
					const from = NODES[edge.from];
					const to = NODES[edge.to];
					return (
						<line
							key={`${from.name}-${to.name}`}
							stroke={edge.cycle ? "#ea2845" : "rgba(232,232,232,0.25)"}
							strokeDasharray={edge.cycle ? "4 3" : undefined}
							x1={`${from.x}%`}
							x2={`${to.x}%`}
							y1={`${from.y}%`}
							y2={`${to.y}%`}
						/>
					);
				})}
			</svg>
			{NODES.map((node) => (
				<span
					className={`absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap border px-2.5 py-1 text-[11px] ${TONE[node.tone]}`}
					key={node.name}
					style={{ left: `${node.x}%`, top: `${node.y}%` }}
				>
					{node.name}
				</span>
			))}
		</div>
		<div className="flex items-center gap-2 border-white/15 border-t px-4 py-2 text-[11px] text-white/70">
			<span className="inline-block h-2 w-2 bg-nest-red" />
			cycle · AuthModule → UsersModule → PrismaModule → AuthModule
		</div>
		<div className="border-white/30 border-t">
			{BOOT.map((entry) => (
				<div
					className="grid grid-cols-[148px_1fr_52px] items-center gap-3 border-white/10 border-b px-4 py-2 last:border-b-0"
					key={entry.name}
				>
					<span className="text-[11px] leading-tight">
						{entry.name}
						<span className="block text-white/70">{entry.hook}</span>
					</span>
					<span className="h-1.5 bg-white/10">
						<span
							className={`block h-full ${entry.hot ? "bg-nest-red" : "bg-white/70"}`}
							style={{ width: `${entry.width}%` }}
						/>
					</span>
					<span className="text-right text-[11px] text-white/[0.92]">
						{entry.ms}
					</span>
				</div>
			))}
		</div>
	</Figure>
);

/* ---------- schema ---------- */

const ENTITIES = [
	{
		name: "User",
		x: 2,
		bad: false,
		fields: [
			["id", "pk uuid"],
			["email", "varchar"],
			["createdAt", "timestamp"],
		],
	},
	{
		name: "Order",
		x: 36,
		bad: false,
		fields: [
			["id", "pk uuid"],
			["userId", "fk → User"],
			["total", "decimal"],
		],
	},
	{
		name: "Payment",
		x: 70,
		bad: true,
		fields: [
			["orderId", "fk → Order"],
			["amount", "decimal"],
			["status", "varchar"],
		],
	},
] as const;

const SCHEMA_FINDINGS = [
	{
		level: "error" as const,
		rule: "schema/require-primary-key",
		text: "Entity 'Payment' has no primary key column.",
	},
	{
		level: "warning" as const,
		rule: "schema/require-timestamps",
		text: "Entity 'Order' has no timestamp columns.",
	},
	{
		level: "info" as const,
		rule: "schema/require-cascade-rule",
		text: "Relation 'order' has no explicit onDelete.",
	},
];

const LEVEL = {
	error: "bg-nest-red text-white",
	info: "border border-white/30 text-white/70",
	warning: "border border-[#d29922] text-[#d29922]",
} as const;

const SchemaDiagram = () => (
	<Figure
		caption="Fig. 04 — Entity relation sketch"
		meta="prisma · 12 entities"
	>
		<div className={BODY}>
			<svg
				aria-hidden="true"
				className="absolute inset-0 h-full w-full"
				focusable="false"
			>
				<line
					stroke="rgba(232,232,232,0.25)"
					x1="30%"
					x2="36%"
					y1="42%"
					y2="42%"
				/>
				<line
					stroke="rgba(232,232,232,0.25)"
					x1="64%"
					x2="70%"
					y1="42%"
					y2="42%"
				/>
			</svg>
			<span className="absolute top-[42%] left-[30.5%] -translate-y-1/2 text-[10px] text-white/70">
				1:N
			</span>
			<span className="absolute top-[42%] left-[64.5%] -translate-y-1/2 text-[10px] text-white/70">
				1:1
			</span>
			{ENTITIES.map((entity) => (
				<div
					className={`absolute top-1/2 w-[28%] -translate-y-1/2 border bg-black ${entity.bad ? "border-nest-red border-dashed" : "border-white/30"}`}
					key={entity.name}
					style={{ left: `${entity.x}%` }}
				>
					<div
						className={`flex items-center justify-between border-b px-2.5 py-1 text-[11px] ${entity.bad ? "border-nest-red/60 bg-nest-red/10 text-nest-red" : "border-white/30 bg-white/[0.06] text-[#f2f1ef]"}`}
					>
						<b className="font-bold">{entity.name}</b>
						{entity.bad ? <span>✗</span> : null}
					</div>
					<div className="px-2.5 py-1.5 text-[11px] leading-relaxed">
						{entity.fields.map(([field, type]) => (
							<div className="flex justify-between gap-2" key={field}>
								<span>{field}</span>
								<span className="text-white/70">{type}</span>
							</div>
						))}
					</div>
				</div>
			))}
		</div>
		<div className="flex items-center gap-2 border-white/15 border-t px-4 py-2 text-[11px] text-white/70">
			<span className="inline-block h-2 w-2 border border-nest-red border-dashed" />
			3 schema findings · reported against the entity
		</div>
		<div className="border-white/30 border-t">
			{SCHEMA_FINDINGS.map((finding) => (
				<div
					className="grid grid-cols-[62px_1fr] items-baseline gap-3 border-white/10 border-b px-4 py-2 last:border-b-0"
					key={finding.rule}
				>
					<span
						className={`px-1.5 py-px text-center font-bold text-[9px] uppercase tracking-[0.06em] ${LEVEL[finding.level]}`}
					>
						{finding.level}
					</span>
					<span className="text-[11px] leading-tight">
						{finding.text}
						<span className="block text-white/70">{finding.rule}</span>
					</span>
				</div>
			))}
		</div>
	</Figure>
);

export const GraphAndSchema = () => (
	<SectionPair
		items={[
			{
				title: "See the architecture your imports actually form.",
				copy: (
					<p>
						Draws the module graph your imports actually form. Add{" "}
						<a
							className="text-nest-red underline underline-offset-4"
							href="/docs/pipeline/output"
						>
							<code>--timings</code>
						</a>{" "}
						with a graph dump from a real <code>nest start</code> and every
						lifecycle hook gets a bar, so the 800ms hiding in an{" "}
						<code>onModuleInit</code> stops being a hunch.
					</p>
				),
				figure: <ModuleGraph />,
				command: "npx nestjs-doctor@latest . --report",
				docs: {
					href: "/docs/pipeline/module-graph",
					label: "Module graph docs",
				},
			},
			{
				title: "The ER diagram you never drew.",
				copy: (
					<p>
						Entities and relations from{" "}
						<b>Prisma, TypeORM, Drizzle, and MikroORM</b> in one diagram, with
						schema rules reporting against the entity.
					</p>
				),
				figure: <SchemaDiagram />,
				command: "npx nestjs-doctor@latest . --report",
				docs: { href: "/docs/rules/schema", label: "Schema rules" },
			},
		]}
	/>
);
