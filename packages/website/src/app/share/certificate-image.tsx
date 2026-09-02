import { ImageResponse } from "next/og";
import { loadPlexMono } from "@/lib/og-font";
import { PERFECT_SCORE, palette, scoreColor, scoreTier } from "@/lib/tui-theme";
import { type CertificateValues, certificateTitle } from "./certificate";

export const CERTIFICATE_IMAGE_SIZE = { width: 1200, height: 630 };
const BAR_WIDTH = 560;
const STAR_COUNT = 5;

const tone = (score: number | null): string =>
	score === null ? palette.muted : scoreColor(score);

const eyes = (score: number | null): string => {
	if (score === null) {
		return "- - -";
	}
	if (score >= 75) {
		return "^ ^ ^";
	}
	return score >= 50 ? "• • •" : "x x x";
};

const Face = ({ score }: { score: number | null }) => (
	<div
		style={{
			display: "flex",
			flexDirection: "column",
			alignItems: "center",
			justifyContent: "center",
			width: 132,
			height: 100,
			border: `3px solid ${tone(score)}`,
			borderRadius: 10,
			color: tone(score),
			fontSize: 30,
			fontWeight: 600,
		}}
	>
		<div style={{ display: "flex" }}>{eyes(score)}</div>
		<div
			style={{
				display: "flex",
				width: 56,
				height: 18,
				borderBottom: `3px solid ${tone(score)}`,
				borderBottomLeftRadius: 14,
				borderBottomRightRadius: 14,
			}}
		/>
	</div>
);

const Stars = ({ filled }: { filled: number }) => (
	<div style={{ display: "flex", gap: 8 }}>
		{Array.from({ length: STAR_COUNT }, (_, index) => (
			<div
				key={index}
				style={{
					display: "flex",
					width: 16,
					height: 16,
					transform: "rotate(45deg)",
					background: index < filled ? "currentColor" : "transparent",
					border: "2px solid currentColor",
				}}
			/>
		))}
	</div>
);

const Seal = ({ score }: { score: number | null }) => (
	<div
		style={{
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			width: 150,
			height: 150,
			borderRadius: 75,
			border: `3px solid ${tone(score)}`,
			color: tone(score),
			transform: "rotate(-8deg)",
		}}
	>
		<div
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				width: 96,
				height: 96,
				borderRadius: 48,
				border: `1.5px solid ${tone(score)}`,
				fontSize: 26,
				fontWeight: 600,
			}}
		>
			{eyes(score)}
		</div>
	</div>
);

const Fact = ({
	label,
	value,
	color,
}: {
	color?: string;
	label: string;
	value: string;
}) => (
	<div style={{ display: "flex", gap: 10, fontSize: 22 }}>
		<div style={{ display: "flex", color: palette.dim }}>{label}</div>
		<div style={{ display: "flex", color: color ?? palette.text }}>{value}</div>
	</div>
);

/** The 1200x630 social card for one certificate; null renders the blank form. */
export async function certificateImage(values: CertificateValues | null) {
	const fonts = await loadPlexMono();
	const score = values?.score ?? null;
	const tier = score === null ? null : scoreTier(score);
	const filledStars =
		tier === null ? 0 : STAR_COUNT - (tier.stars.match(/☆/g)?.length ?? 0);
	const facts: { color?: string; label: string; value: string }[] = [];
	if (values?.errorCount !== null && values?.errorCount !== undefined) {
		facts.push({
			label: "Errors",
			value: String(values.errorCount),
			color: palette.error,
		});
	}
	if (values?.warningCount !== null && values?.warningCount !== undefined) {
		facts.push({
			label: "Warnings",
			value: String(values.warningCount),
			color: palette.warning,
		});
	}
	if (values?.infoCount !== null && values?.infoCount !== undefined) {
		facts.push({
			label: "Info",
			value: String(values.infoCount),
			color: palette.info,
		});
	}
	if (values?.fileCount !== null && values?.fileCount !== undefined) {
		facts.push({ label: "Files", value: String(values.fileCount) });
	}
	if (values?.nestVersion) {
		facts.push({ label: "Nest", value: values.nestVersion });
	}
	if (values?.orm) {
		facts.push({ label: "ORM", value: values.orm });
	}
	const signed = [
		values?.toolVersion
			? `Signed, nestjs-doctor ${values.toolVersion}`
			: "Signed, nestjs-doctor",
		values?.commit ? `commit ${values.commit}` : null,
		values?.scanDate ?? null,
	]
		.filter((part) => part !== null)
		.join(" · ");

	return new ImageResponse(
		<div
			style={{
				width: "100%",
				height: "100%",
				display: "flex",
				background: "#0a0a0a",
				padding: 28,
				fontFamily: '"IBM Plex Mono", monospace',
				color: palette.text,
			}}
		>
			<div
				style={{
					display: "flex",
					flex: 1,
					border: `4px solid ${tone(score)}`,
					padding: 5,
				}}
			>
				<div
					style={{
						display: "flex",
						flex: 1,
						flexDirection: "column",
						justifyContent: "space-between",
						border: `2px solid ${tone(score)}`,
						padding: "36px 56px",
					}}
				>
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							gap: 6,
						}}
					>
						<div
							style={{
								display: "flex",
								fontSize: 26,
								fontWeight: 600,
								letterSpacing: 10,
								color: palette.bright,
							}}
						>
							CERTIFICATE OF HEALTH
						</div>
						<div
							style={{ display: "flex", fontSize: 20, color: palette.muted }}
						>
							Issued by nestjs-doctor, the deterministic NestJS analyzer
						</div>
					</div>

					<div
						style={{
							display: "flex",
							fontSize: 52,
							fontWeight: 600,
							color: palette.bright,
						}}
					>
						{values ? certificateTitle(values) : "Your NestJS codebase"}
					</div>

					<div style={{ display: "flex", alignItems: "center", gap: 28 }}>
						<Face score={score} />
						<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: 20,
									fontSize: 44,
									fontWeight: 600,
									color: tone(score),
								}}
							>
								<div style={{ display: "flex" }}>
									{score === null
										? `--/${PERFECT_SCORE}`
										: `${score}/${PERFECT_SCORE}`}
								</div>
								<Stars filled={filledStars} />
								{tier ? (
									<div
										style={{
											display: "flex",
											fontSize: 30,
											fontWeight: 400,
											color: palette.muted,
										}}
									>
										{tier.label}
									</div>
								) : null}
							</div>
							<div
								style={{
									display: "flex",
									width: BAR_WIDTH,
									height: 22,
									background: "#262626",
								}}
							>
								<div
									style={{
										display: "flex",
										width: ((score ?? 0) / PERFECT_SCORE) * BAR_WIDTH,
										height: 22,
										background: tone(score),
									}}
								/>
							</div>
						</div>
					</div>

					<div style={{ display: "flex", gap: 26, flexWrap: "wrap" }}>
						{facts.map((fact) => (
							<Fact key={fact.label} {...fact} />
						))}
					</div>

					<div
						style={{
							display: "flex",
							alignItems: "flex-end",
							justifyContent: "space-between",
						}}
					>
						<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
							<div
								style={{
									display: "flex",
									width: 150,
									height: 3,
									background: palette.nestRed,
								}}
							/>
							<div
								style={{ display: "flex", fontSize: 20, color: palette.muted }}
							>
								{signed}
							</div>
							<div
								style={{ display: "flex", fontSize: 20, color: palette.dim }}
							>
								npx -y nestjs-doctor@latest .
							</div>
						</div>
						<Seal score={score} />
					</div>
				</div>
			</div>
		</div>,
		{ ...CERTIFICATE_IMAGE_SIZE, fonts }
	);
}
