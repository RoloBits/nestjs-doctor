import { SoftwareApplicationJsonLd } from "@/components/json-ld";
import {
	ModuleGraphSection,
	SchemaSection,
} from "@/components/landing/graph-and-schema";
import { Hero, Nav } from "@/components/landing/hero";
import { PrReview } from "@/components/landing/pr-review";
import { Doc } from "@/components/landing/primitives";

const LINKS = [
	{
		href: "https://github.com/RoloBits/nestjs-doctor",
		label: "GitHub",
		primary: true,
	},
	{ href: "/docs", label: "Docs", primary: false },
	{
		href: "https://marketplace.visualstudio.com/items?itemName=rolobits.nestjs-doctor-vscode",
		label: "VS Code extension",
		primary: false,
	},
	{
		href: "https://github.com/marketplace/actions/nestjs-doctor",
		label: "GitHub Action",
		primary: false,
	},
];

const Home = () => (
	<>
		<SoftwareApplicationJsonLd />
		<Doc>
			<div className="flex min-h-dvh flex-col">
				<Nav />
				<Hero />
			</div>

			<PrReview />
			<ModuleGraphSection />
			<SchemaSection />

			<section className="py-14">
				<div className="flex flex-wrap gap-2">
					{LINKS.map((link) => (
						<a
							className={`inline-flex items-center border px-4 py-1.5 font-bold text-[11px] uppercase tracking-[0.08em] no-underline transition-colors ${
								link.primary
									? "border-nest-red bg-nest-red text-white hover:border-white hover:bg-white hover:text-black"
									: "border-white/30 text-white/70 hover:border-white hover:bg-white hover:text-black"
							}`}
							href={link.href}
							key={link.href}
						>
							{link.label}
						</a>
					))}
				</div>
			</section>

			<footer className="border-white/30 border-t py-5 pb-10">
				<div className="flex flex-wrap justify-between gap-3 font-bold text-[11px] text-white/55 uppercase tracking-[0.1em]">
					<span>
						NDX-001 · nestjs-doctor · MIT · will look the same next year
					</span>
					<span className="font-extralight normal-case tracking-[0.06em]">
						no telemetry · no network calls at scan time · RoloBits
					</span>
				</div>
			</footer>
		</Doc>
	</>
);

export default Home;
