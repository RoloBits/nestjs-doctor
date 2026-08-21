import { Figure, Section } from "./primitives";

const MODULES = [
	{ name: "AppModule", x: 50, y: 12, tone: "root" },
	{ name: "AuthModule", x: 16, y: 42, tone: "plain" },
	{ name: "UsersModule", x: 44, y: 48, tone: "cycle" },
	{ name: "OrdersModule", x: 78, y: 40, tone: "plain" },
	{ name: "NotificationsModule", x: 26, y: 80, tone: "plain" },
	{ name: "PrismaModule", x: 66, y: 80, tone: "cycle" },
] as const;

const EDGES = [
	{ from: 0, to: 1, cycle: false },
	{ from: 0, to: 2, cycle: false },
	{ from: 0, to: 3, cycle: false },
	{ from: 1, to: 2, cycle: true },
	{ from: 2, to: 5, cycle: true },
	{ from: 3, to: 5, cycle: true },
	{ from: 2, to: 4, cycle: false },
] as const;

const TONE = {
	cycle: "border-nest-red text-nest-red",
	plain: "border-white/30 text-white/[0.88]",
	root: "border-white bg-white text-black",
} as const;

const BOOT = [
	{ name: "PrismaService", hook: "onModuleInit", ms: 812, width: 100 },
	{ name: "AuthModule", hook: "onApplicationBootstrap", ms: 96, width: 12 },
	{ name: "CacheService", hook: "onModuleInit", ms: 41, width: 5 },
];

const ModuleGraph = () => (
	<Figure caption="Fig. 04 — Module graph" meta="6 modules · 1 cycle">
		<div className="relative h-[320px]">
			<svg
				aria-label="A module graph with one dependency cycle highlighted"
				className="absolute inset-0 h-full w-full"
				role="img"
			>
				<title>Module graph</title>
				{EDGES.map((edge) => {
					const from = MODULES[edge.from];
					const to = MODULES[edge.to];
					return (
						<line
							key={`${from.name}-${to.name}`}
							stroke={edge.cycle ? "#ea2845" : "rgba(232,232,232,0.28)"}
							strokeDasharray={edge.cycle ? "4 3" : undefined}
							x1={`${from.x}%`}
							x2={`${to.x}%`}
							y1={`${from.y + 4}%`}
							y2={`${to.y - 2}%`}
						/>
					);
				})}
			</svg>
			{MODULES.map((node) => (
				<span
					className={`absolute -translate-x-1/2 whitespace-nowrap border px-2.5 py-1 text-[11px] ${TONE[node.tone]}`}
					key={node.name}
					style={{ left: `${node.x}%`, top: `${node.y}%` }}
				>
					{node.name}
				</span>
			))}
			<span className="absolute bottom-2 left-3 flex items-center gap-2 text-[11px] text-white/55">
				<span className="inline-block h-2 w-2 bg-nest-red" />
				blast radius of PrismaModule · 2 dependents
			</span>
		</div>
		<div className="border-white/30 border-t">
			<div className="flex justify-between border-white/15 border-b px-4 py-2">
				<span className="font-bold text-[11px] text-white/55 uppercase tracking-[0.08em]">
					Fig. 04a — Boot trace
				</span>
				<span className="text-[11px] text-white/55">
					nest start · ready in 1.94s
				</span>
			</div>
			{BOOT.map((entry) => (
				<div
					className="grid grid-cols-[150px_1fr_56px] items-center gap-3 px-4 py-2"
					key={entry.name}
				>
					<span className="text-[11px] leading-tight">
						{entry.name}
						<span className="block text-white/55">{entry.hook}</span>
					</span>
					<span className="h-1.5 bg-white/10">
						<span
							className={`block h-full ${entry.ms > 500 ? "bg-nest-red" : "bg-white/70"}`}
							style={{ width: `${entry.width}%` }}
						/>
					</span>
					<span className="text-right text-[11px] text-white/[0.88]">
						{entry.ms}ms
					</span>
				</div>
			))}
		</div>
	</Figure>
);

const ENTITIES = [
	{
		name: "User",
		x: 4,
		y: 10,
		bad: false,
		fields: [
			["id", "pk uuid"],
			["email", "varchar unique"],
			["name", "varchar"],
		],
	},
	{
		name: "Order",
		x: 38,
		y: 44,
		bad: false,
		fields: [
			["id", "pk uuid"],
			["userId", "fk → User.id"],
			["total", "decimal"],
		],
	},
	{
		name: "Payment",
		x: 70,
		y: 10,
		bad: true,
		fields: [
			["orderId", "fk → Order.id"],
			["amount", "decimal"],
			["status", "varchar"],
		],
	},
] as const;

const SchemaDiagram = () => (
	<Figure
		caption="Fig. 05 — Entity relation sketch"
		meta="prisma · 12 entities"
	>
		<div className="relative h-[300px]">
			{ENTITIES.map((entity) => (
				<div
					className={`absolute w-[30%] border ${entity.bad ? "border-nest-red border-dashed" : "border-white/30"}`}
					key={entity.name}
					style={{ left: `${entity.x}%`, top: `${entity.y}%` }}
				>
					<div
						className={`flex items-center justify-between border-b px-2.5 py-1 text-[11px] ${entity.bad ? "border-nest-red/60 bg-nest-red/10 text-nest-red" : "border-white/30 bg-white/[0.06] text-[#f2f1ef]"}`}
					>
						<b className="font-bold">{entity.name}</b>
						{entity.bad ? <span>✗</span> : null}
					</div>
					<div className="px-2.5 py-1.5 text-[11px] leading-relaxed">
						{entity.fields.map(([field, type]) => (
							<div key={field}>
								{field} <span className="text-white/55">{type}</span>
							</div>
						))}
					</div>
				</div>
			))}
		</div>
		<div className="flex flex-wrap items-center gap-3 border-white/30 border-t px-4 py-2.5 text-[11px]">
			<span className="bg-nest-red px-2 py-px font-bold text-white uppercase tracking-[0.06em]">
				Error
			</span>
			<span className="text-white/55">schema/require-primary-key</span>
			<span className="text-white/[0.88]">
				Entity 'Payment' has no primary key
			</span>
		</div>
	</Figure>
);

export const ModuleGraphSection = () => (
	<Section
		copy={
			<>
				<p>
					The HTML report draws your real module graph — imports, exports,
					providers. Pick a module and see everything that transitively depends
					on it before you touch it.
				</p>
				<p>
					<b>Boot trace.</b> Timings from a real <code>nest start</code>: every
					lifecycle hook, per class, in order. The 800ms hiding in an{" "}
					<code>onModuleInit</code> shows up as a bar, not a hunch.
				</p>
			</>
		}
		figure={<ModuleGraph />}
		title="See the architecture your imports actually form."
	/>
);

export const SchemaSection = () => (
	<Section
		copy={
			<>
				<p>
					The scanner extracts entities and relations from{" "}
					<b>Prisma, TypeORM, Drizzle, and MikroORM</b> into one graph, and the
					report draws it as an ER diagram.
				</p>
				<p>
					Schema rules run against that graph: missing primary keys, unindexed
					foreign keys, relations that only exist in one direction. They report
					against the <b>entity</b> — a schema problem doesn't have a line
					number, and the report doesn't pretend it does.
				</p>
			</>
		}
		figure={<SchemaDiagram />}
		figureLeft
		title="The ER diagram you never drew."
	/>
);
