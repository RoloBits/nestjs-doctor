import { DocsHeader } from "@/components/docs/docs-header";
import { Sidebar } from "@/components/docs/sidebar";

export default function DocsLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className="flex min-h-screen flex-col bg-[#0a0a0a] font-mono text-neutral-300">
			<DocsHeader />
			<div className="flex flex-1">
				<Sidebar />
				<main className="docs-content min-w-0 flex-1 px-6 py-8 sm:px-10 lg:px-16">
					<div className="mx-auto max-w-3xl">{children}</div>
				</main>
			</div>
		</div>
	);
}
