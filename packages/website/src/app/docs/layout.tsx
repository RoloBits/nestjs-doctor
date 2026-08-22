import { Sidebar } from "@/components/docs/sidebar";
import { Toc } from "@/components/docs/toc";
import { Nav } from "@/components/site-nav";

export default function DocsLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className="flex min-h-screen flex-col bg-black font-mono text-neutral-300">
			<div className="mx-auto w-full max-w-[1320px] px-6">
				<Nav />
			</div>
			<div className="mx-auto flex w-full max-w-[1320px] flex-1 px-6">
				<Sidebar />
				<main className="docs-content min-w-0 flex-1 px-6 py-8 sm:px-10 lg:px-16">
					<div className="mx-auto max-w-3xl">{children}</div>
				</main>
				{/* The TOC column, sized on the server. */}
				<div className="hidden w-56 shrink-0 xl:block">
					<Toc />
				</div>
			</div>
		</div>
	);
}
