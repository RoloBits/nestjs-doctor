import { SoftwareApplicationJsonLd } from "@/components/json-ld";
import { GraphAndSchema } from "@/components/landing/graph-and-schema";
import { Hero } from "@/components/landing/hero";
import { PrReview } from "@/components/landing/pr-review";
import { Doc } from "@/components/landing/primitives";
import { Nav } from "@/components/site-nav";

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
			<GraphAndSchema />

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
							rel={link.href.startsWith("http") ? "noreferrer" : undefined}
							target={link.href.startsWith("http") ? "_blank" : undefined}
						>
							{link.label}
						</a>
					))}
				</div>
			</section>

			<footer className="border-white/30 border-t py-5 pb-10">
				<div className="flex flex-wrap justify-between gap-3 font-bold text-[11px] text-white/75 uppercase tracking-[0.1em]">
					<span>nestjs-doctor · MIT</span>
					<span className="normal-case tracking-[0.06em]">
						your code never leaves your machine ·{" "}
						<a
							className="text-white/75 underline decoration-white/30 underline-offset-2 transition-colors hover:text-white hover:decoration-white"
							href="https://x.com/FranLoPy"
							rel="noreferrer"
							target="_blank"
						>
							RoloBits
						</a>
					</span>
				</div>
			</footer>
		</Doc>
	</>
);

export default Home;
