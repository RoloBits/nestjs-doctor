"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import {
	isFocusInFrame,
	isInteractiveTarget,
	isTypingTarget,
} from "@/lib/keyboard";
import { SITE_URL } from "@/lib/site";
import {
	getNestBirds,
	MENU_CLASS,
	MENU_ROW_CLASS,
	PERFECT_SCORE,
	palette,
	scoreColor,
} from "@/lib/tui-theme";
import AnimatedScore from "./animated-score";
import {
	type CertificateValues,
	certificateFromQuery,
	certificateTitle,
} from "./certificate";

const COMMAND = "npx -y nestjs-doctor@latest .";
const LEADERBOARD_PATH = "/leaderboard";
const COPIED_RESET_MS = 1600;
const SEAL_SIZE = 96;
const SEAL_LEGEND = "NESTJS-DOCTOR · DETERMINISTIC · SAME OUTPUT EVERY RUN";
const SIGNATURE_PATH =
	"M 4 34 C 14 6, 26 4, 28 16 C 30 28, 18 34, 16 22 C 14 10, 30 8, 40 20 C 46 27, 52 30, 58 18 C 62 10, 70 12, 72 22 C 74 32, 84 30, 96 14 C 104 4, 118 6, 126 18";
const X_ICON_PATH =
	"M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z";
const LINKEDIN_ICON_PATH =
	"M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z";

const FRAME_CLASS =
	"flex flex-col gap-4 px-4 py-4 text-[13px] leading-[1.5] sm:px-6";
/** The certificate's border: a CSS double rule in the score colour. */
const CERTIFICATE_CLASS = "flex flex-col gap-4 border-4 border-double p-6";

const ThinRule = () => <div className="border-white/15 border-t" />;

/** The face a certificate wears when its link carried no usable score. */
const NO_SCORE_EYES = "- - -";
const NO_SCORE_MOUTH = "╰───╯";

const scoreTone = (score: number | null): string =>
	score === null ? palette.muted : scoreColor(score);

const scoreFace = (score: number | null): [string, string] =>
	score === null ? [NO_SCORE_EYES, NO_SCORE_MOUTH] : getNestBirds(score);

const NestFace = ({ score }: { score: number | null }) => {
	const [eyes, mouth] = scoreFace(score);
	return (
		<pre
			aria-hidden="true"
			className="m-0 leading-tight"
			style={{ color: scoreTone(score) }}
		>
			{`┌───────┐\n│ ${eyes} │\n│ ${mouth} │\n└───────┘`}
		</pre>
	);
};

/** A circular stamp: two rings, the legend on the rim, the face at the centre. */
const Seal = ({ score }: { score: number | null }) => {
	const [eyes] = scoreFace(score);
	return (
		<svg
			aria-hidden="true"
			height={SEAL_SIZE}
			style={{ color: scoreTone(score), transform: "rotate(-8deg)" }}
			viewBox="0 0 100 100"
			width={SEAL_SIZE}
		>
			<defs>
				<path
					d="M 50 50 m -38 0 a 38 38 0 1 1 76 0 a 38 38 0 1 1 -76 0"
					fill="none"
					id="seal-rim"
				/>
			</defs>
			<circle
				cx="50"
				cy="50"
				fill="none"
				r="47"
				stroke="currentColor"
				strokeWidth="1.5"
			/>
			<circle
				cx="50"
				cy="50"
				fill="none"
				r="30"
				stroke="currentColor"
				strokeWidth="0.75"
			/>
			<text fill="currentColor" fontSize="5.5" letterSpacing="0.4">
				<textPath href="#seal-rim" startOffset="50%" textAnchor="middle">
					{SEAL_LEGEND}
				</textPath>
			</text>
			<text fill="currentColor" fontSize="10" textAnchor="middle" x="50" y="54">
				{eyes}
			</text>
		</svg>
	);
};

const Signature = () => (
	<svg aria-hidden="true" height="34" viewBox="0 0 140 44" width="110">
		<path
			d={SIGNATURE_PATH}
			fill="none"
			stroke={palette.nestRed}
			strokeLinecap="round"
			strokeWidth="2"
		/>
	</svg>
);

interface Fact {
	color?: string;
	label: string;
	value: string;
}

interface MenuItem {
	copy?: string;
	hint: string;
	href?: string;
	icon?: string;
	internal?: boolean;
	label: string;
}

export const CertificateScreen = ({
	certificate,
}: {
	certificate: CertificateValues;
}) => {
	const router = useRouter();
	const [menuIndex, setMenuIndex] = useState(0);
	const [toast, setToast] = useState<string | null>(null);
	const menuRefs = useRef<(HTMLElement | null)[]>([]);
	const frameRef = useRef<HTMLDivElement>(null);

	const {
		score,
		errorCount,
		warningCount,
		infoCount,
		fileCount,
		moduleCount,
		packageName,
		repoName,
		nestVersion,
		orm,
		commit,
		scanDate,
		toolVersion,
	} = certificate;
	const displayName = certificateTitle(certificate);
	const shareUrl = `${SITE_URL}${certificate.sharePath}`;

	const tweetText =
		score === null
			? `${displayName} was scanned with nestjs-doctor. Run it on yours:`
			: `${displayName} scored ${score}/${PERFECT_SCORE} on nestjs-doctor. Run it on yours:`;
	const twitterShareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(shareUrl)}`;
	const linkedinShareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;

	const facts: Fact[] = [];
	if (errorCount !== null) {
		facts.push({
			label: "Errors",
			value: String(errorCount),
			color: palette.error,
		});
	}
	if (warningCount !== null) {
		facts.push({
			label: "Warnings",
			value: String(warningCount),
			color: palette.warning,
		});
	}
	if (infoCount !== null) {
		facts.push({
			label: "Info",
			value: String(infoCount),
			color: palette.info,
		});
	}
	if (fileCount !== null) {
		facts.push({ label: "Files", value: String(fileCount) });
	}
	if (moduleCount !== null) {
		facts.push({ label: "Modules", value: String(moduleCount) });
	}
	if (nestVersion) {
		facts.push({ label: "Nest version", value: nestVersion });
	}
	if (orm) {
		facts.push({ label: "ORM", value: orm });
	}
	if (repoName && packageName) {
		facts.push({ label: "Package", value: packageName });
	}
	if (commit) {
		facts.push({ label: "Commit", value: commit });
	}
	if (scanDate) {
		facts.push({ label: "Scan date", value: scanDate });
	}
	if (toolVersion) {
		facts.push({ label: "Tool version", value: toolVersion });
	}

	const handleCopy = useCallback(async (value: string, label: string) => {
		try {
			await navigator.clipboard.writeText(value);
			track("command_copied", { command: value, surface: "certificate" });
			setToast(`Copied ${label}`);
			setTimeout(() => setToast(null), COPIED_RESET_MS);
		} catch {
			// Clipboard is unavailable outside a secure context.
		}
	}, []);

	const items: MenuItem[] = [
		{
			label: "Share on X",
			hint: "Post this certificate",
			href: twitterShareUrl,
			icon: X_ICON_PATH,
		},
		{
			label: "Share on LinkedIn",
			hint: "Post this certificate",
			href: linkedinShareUrl,
			icon: LINKEDIN_ICON_PATH,
		},
		{ label: "Copy link", hint: shareUrl, copy: shareUrl },
		{ label: "Run it on your codebase", hint: COMMAND, copy: COMMAND },
		{
			label: "Back to the leaderboard",
			hint: "Every project we measured",
			href: LEADERBOARD_PATH,
			internal: true,
		},
	];
	const labelWidth = Math.max(...items.map((item) => item.label.length));
	const menuCount = items.length;

	useEffect(() => {
		const onKeyDown = (event: globalThis.KeyboardEvent) => {
			if (event.metaKey || event.ctrlKey || event.altKey) {
				return;
			}
			if (isTypingTarget(event.target)) {
				return;
			}
			const active = document.activeElement;
			if (!isFocusInFrame(active, frameRef.current)) {
				return;
			}
			if (event.key === "ArrowDown" || event.key === "j") {
				event.preventDefault();
				const next = (menuIndex + 1) % menuCount;
				setMenuIndex(next);
				menuRefs.current[next]?.focus();
				return;
			}
			if (event.key === "ArrowUp" || event.key === "k") {
				event.preventDefault();
				const next = menuIndex === 0 ? menuCount - 1 : menuIndex - 1;
				setMenuIndex(next);
				menuRefs.current[next]?.focus();
				return;
			}
			if (
				event.key === "Escape" ||
				event.key === "ArrowLeft" ||
				event.key === "h"
			) {
				event.preventDefault();
				router.push(LEADERBOARD_PATH);
				return;
			}
			if (event.key === "Enter") {
				const onMenuRow = menuRefs.current.some((node) => node === active);
				if (!onMenuRow && isInteractiveTarget(active)) {
					return;
				}
				const row = menuRefs.current[menuIndex];
				if (row) {
					event.preventDefault();
					row.click();
				}
			}
		};

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [menuIndex, menuCount, router]);

	return (
		<div className={FRAME_CLASS} ref={frameRef} style={{ color: palette.text }}>
			<div
				className={CERTIFICATE_CLASS}
				style={{ borderColor: `${scoreTone(score)}99` }}
			>
				<div className="flex flex-col items-center gap-1 text-center">
					<div
						className="font-bold text-sm tracking-[0.4em] sm:text-base"
						style={{ color: palette.bright }}
					>
						CERTIFICATE OF HEALTH
					</div>
					<div style={{ color: palette.muted }}>
						Issued by nestjs-doctor, the deterministic NestJS analyzer
					</div>
				</div>

				<ThinRule />

				<div
					className="break-words font-bold text-xl sm:text-2xl"
					style={{ color: palette.bright }}
				>
					{displayName}
				</div>

				<div className="flex flex-wrap items-center gap-4">
					<NestFace score={score} />
					<AnimatedScore targetScore={score} />
				</div>

				{facts.length > 0 ? (
					<dl className="grid grid-cols-[max-content_1fr] gap-x-6">
						{facts.map((fact) => (
							<div className="contents" key={fact.label}>
								<dt style={{ color: palette.dim }}>{fact.label}</dt>
								<dd
									className="break-all"
									style={{ color: fact.color ?? palette.text }}
								>
									{fact.value}
								</dd>
							</div>
						))}
					</dl>
				) : null}

				<div className="flex flex-wrap items-end justify-between gap-4">
					<div className="flex flex-col gap-1">
						<Signature />
						<div style={{ color: palette.muted }}>
							{toolVersion
								? `Signed, nestjs-doctor ${toolVersion}`
								: "Signed, nestjs-doctor"}
						</div>
					</div>
					<Seal score={score} />
				</div>

				<ThinRule />

				<div className="flex flex-wrap items-center gap-3">
					<span style={{ color: palette.muted }}>{`Verify: ${COMMAND}`}</span>
					<button
						className="border px-2 py-0.5 transition-colors hover:bg-white hover:text-black"
						onClick={() => handleCopy(COMMAND, "the command")}
						style={{ borderColor: palette.border }}
						type="button"
					>
						Copy
					</button>
				</div>
			</div>

			<div className={MENU_CLASS} style={{ borderColor: palette.nestRed }}>
				{items.map((item, index) => {
					const active = index === menuIndex;
					const rowStyle = {
						backgroundColor: active ? palette.washRed : undefined,
					};
					const labelStyle = {
						color: active ? palette.bright : palette.text,
						fontWeight: active ? 700 : 400,
						minWidth: `${labelWidth}ch`,
					};
					const body = (
						<>
							<span
								className="w-[3px] self-stretch"
								style={{
									backgroundColor: active ? palette.nestRed : "transparent",
								}}
							/>
							<span className="flex items-baseline gap-2" style={labelStyle}>
								{item.icon ? (
									<svg
										aria-hidden="true"
										fill="currentColor"
										height="12"
										viewBox="0 0 24 24"
										width="12"
									>
										<path d={item.icon} />
									</svg>
								) : null}
								{item.label}
							</span>
							<span
								className="min-w-0 truncate"
								style={{ color: active ? palette.muted : palette.dim }}
							>
								{item.hint}
							</span>
						</>
					);

					if (item.internal && item.href) {
						return (
							<Link
								className={MENU_ROW_CLASS}
								href={item.href}
								key={item.label}
								onFocus={() => setMenuIndex(index)}
								onMouseEnter={() => setMenuIndex(index)}
								ref={(node) => {
									menuRefs.current[index] = node;
								}}
								style={rowStyle}
							>
								{body}
							</Link>
						);
					}

					if (item.href) {
						return (
							<a
								className={MENU_ROW_CLASS}
								href={item.href}
								key={item.label}
								onFocus={() => setMenuIndex(index)}
								onMouseEnter={() => setMenuIndex(index)}
								ref={(node) => {
									menuRefs.current[index] = node;
								}}
								rel="noreferrer"
								style={rowStyle}
								target="_blank"
							>
								{body}
							</a>
						);
					}

					return (
						<button
							className={MENU_ROW_CLASS}
							key={item.label}
							onClick={() => item.copy && handleCopy(item.copy, item.copy)}
							onFocus={() => setMenuIndex(index)}
							onMouseEnter={() => setMenuIndex(index)}
							ref={(node) => {
								menuRefs.current[index] = node;
							}}
							style={rowStyle}
							type="button"
						>
							{body}
						</button>
					);
				})}
			</div>

			<div className="flex flex-col">
				{toast ? (
					<div style={{ color: palette.success }}>{`✓ ${toast}`}</div>
				) : null}
				<div style={{ color: palette.dim }}>
					↑↓ move · enter open · esc back
				</div>
			</div>
		</div>
	);
};

/** The certificate described by the query string. Needs a Suspense boundary. */
export const QueryCertificateScreen = () => {
	const searchParams = useSearchParams();
	return (
		<CertificateScreen
			certificate={certificateFromQuery((key) => searchParams.get(key))}
		/>
	);
};
