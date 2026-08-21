import { defineVideo } from "tcut";

const SCRIPT = new URL("./animate-scan.mjs", import.meta.url).pathname;

export default defineVideo(
	{
		output: ["nestjs-doctor-demo.mp4"],
		theme: "matte-black",
		prompt: "$ ",
		cols: 76,
		rows: 26,
		typingSpeed: "30ms",
		typingJitter: 0.3,
		windowBar: "rings",
		title: "Terminal — nestjs-doctor",
		borderRadius: 0,
	},
	async (t) => {
		await t.hide(async () => {
			await t.run("rm -f /tmp/nd-demo-scanned");
			await t.run(`npx() { node "${SCRIPT}" scan; }`);
			await t.run(`claude() { node "${SCRIPT}" agent; }`);
			await t.clear();
		});
		await t.sleep("400ms");
		await t.run("npx -y nestjs-doctor@latest .");
		await t.sleep("500ms");
		await t.run("claude");
		await t.sleep("700ms");
		await t.run("npx -y nestjs-doctor@latest .");
		await t.sleep("1.8s");
	}
);
