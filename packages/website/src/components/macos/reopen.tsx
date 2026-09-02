const CARD_CLASS =
	"flex cursor-pointer flex-col items-center gap-3 rounded-xl border border-white/30 bg-white/20 px-8 py-6 shadow-xl backdrop-blur-xl transition-colors hover:bg-white/30";
const THUMBNAIL_CLASS =
	"flex h-16 w-20 flex-col overflow-hidden rounded-md border border-white/15 bg-[#0a0a0a] shadow-md";

/** The card that stands in for the window once it has been closed. */
export const ReopenCard = ({
	label,
	onReopen,
}: {
	label: string;
	onReopen: () => void;
}) => (
	<button className={CARD_CLASS} onClick={onReopen} type="button">
		<span className={THUMBNAIL_CLASS}>
			<span className="flex items-center gap-1 bg-[#2a2a2c] px-2 py-1">
				<span className="h-1.5 w-1.5 rounded-full bg-[#FF5F57]" />
				<span className="h-1.5 w-1.5 rounded-full bg-[#FFBD2E]" />
				<span className="h-1.5 w-1.5 rounded-full bg-[#28CA41]" />
			</span>
			<span className="flex flex-1 items-center justify-center">
				<svg
					aria-hidden="true"
					className="h-5 w-5 text-white/40"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
					/>
				</svg>
			</span>
		</span>
		<span className="font-medium text-[13px] text-black/70">{label}</span>
	</button>
);
