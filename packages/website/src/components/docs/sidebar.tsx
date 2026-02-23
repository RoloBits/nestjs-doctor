"use client";

import { ChevronRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { NavSection } from "@/lib/docs-navigation";
import { DOCS_NAV } from "@/lib/docs-navigation";

const SidebarSection = ({
	section,
	pathname,
}: {
	section: NavSection;
	pathname: string;
}) => {
	const isActive = section.items.some((item) => item.href === pathname);
	const [isOpen, setIsOpen] = useState(isActive);

	return (
		<div className="mb-2">
			<button
				className="flex w-full items-center gap-1 py-1.5 font-medium text-neutral-400 text-sm hover:text-white"
				onClick={() => setIsOpen((prev) => !prev)}
				type="button"
			>
				<ChevronRight
					className={`shrink-0 transition-transform duration-150 ${isOpen ? "rotate-90" : ""}`}
					size={14}
				/>
				{section.title}
			</button>
			{isOpen && (
				<ul className="ml-4 border-white/10 border-l">
					{section.items.map((item) => {
						const active = pathname === item.href;
						return (
							<li key={item.href}>
								<Link
									className={`block py-1 pl-3 text-sm transition-colors ${
										active
											? "-ml-px border-nest-red border-l text-white"
											: "text-neutral-500 hover:text-neutral-300"
									}`}
									href={item.href}
								>
									{item.title}
								</Link>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
};

export const Sidebar = () => {
	const pathname = usePathname();
	const [mobileOpen, setMobileOpen] = useState(false);

	const nav = (
		<nav className="docs-sidebar overflow-y-auto p-4">
			{DOCS_NAV.map((section) => (
				<SidebarSection
					key={section.title}
					pathname={pathname}
					section={section}
				/>
			))}
		</nav>
	);

	return (
		<>
			{/* Mobile toggle */}
			<button
				aria-label="Toggle sidebar"
				className="fixed top-3 left-3 z-50 rounded border border-white/20 bg-[#0a0a0a] p-1.5 lg:hidden"
				onClick={() => setMobileOpen((prev) => !prev)}
				type="button"
			>
				{mobileOpen ? <X size={18} /> : <Menu size={18} />}
			</button>

			{/* Mobile overlay */}
			{mobileOpen && (
				<button
					aria-label="Close sidebar"
					className="fixed inset-0 z-40 bg-black/60 lg:hidden"
					onClick={() => setMobileOpen(false)}
					type="button"
				/>
			)}

			{/* Sidebar panel */}
			<aside
				className={`fixed top-0 left-0 z-40 h-screen w-64 border-white/10 border-r bg-[#0a0a0a] pt-12 transition-transform lg:static lg:z-auto lg:translate-x-0 lg:pt-0 ${
					mobileOpen ? "translate-x-0" : "-translate-x-full"
				}`}
			>
				{nav}
			</aside>
		</>
	);
};
