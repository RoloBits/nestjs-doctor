import { join } from "node:path";
import {
	commands,
	type ExtensionContext,
	StatusBarAlignment,
	window,
	workspace,
} from "vscode";
import {
	LanguageClient,
	type LanguageClientOptions,
	type ServerOptions,
	TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;
let statusBarItem: ReturnType<typeof window.createStatusBarItem>;

function getServerPath(context: ExtensionContext): string {
	return context.asAbsolutePath(join("dist", "server.cjs"));
}

function updateStatusBar(scanning = false) {
	if (scanning) {
		statusBarItem.text = "$(sync~spin) NestJS Doctor";
		statusBarItem.tooltip = "Scanning...";
		return;
	}

	statusBarItem.text = "$(shield) NestJS Doctor";
	statusBarItem.tooltip = "NestJS Doctor: Click to re-scan";
}

export async function activate(context: ExtensionContext): Promise<void> {
	const output = window.createOutputChannel("NestJS Doctor");
	context.subscriptions.push(output);
	output.appendLine("NestJS Doctor: activating...");

	try {
		const config = workspace.getConfiguration("nestjsDoctor");
		if (!config.get<boolean>("enable", true)) {
			output.appendLine("NestJS Doctor is disabled via settings, skipping.");
			return;
		}

		statusBarItem = window.createStatusBarItem(StatusBarAlignment.Right, 100);
		statusBarItem.command = "nestjs-doctor.scan";
		statusBarItem.text = "$(shield) NestJS Doctor";
		statusBarItem.show();
		context.subscriptions.push(statusBarItem);

		const serverPath = getServerPath(context);

		const serverOptions: ServerOptions = {
			run: { module: serverPath, transport: TransportKind.ipc },
			debug: { module: serverPath, transport: TransportKind.ipc },
		};

		const clientOptions: LanguageClientOptions = {
			documentSelector: [{ scheme: "file", language: "typescript" }],
			synchronize: {
				configurationSection: "nestjsDoctor",
			},
			outputChannel: output,
		};

		client = new LanguageClient(
			"nestjs-doctor",
			"NestJS Doctor",
			serverOptions,
			clientOptions
		);

		const scanCommand = commands.registerCommand(
			"nestjs-doctor.scan",
			async () => {
				if (!client) {
					return;
				}
				updateStatusBar(true);
				await client.sendRequest("nestjs-doctor/scan");
				updateStatusBar();
			}
		);
		context.subscriptions.push(scanCommand);

		await client.start();
		output.appendLine("NestJS Doctor activated");
	} catch (error) {
		output.appendLine(`NestJS Doctor failed to activate: ${error}`);
		output.show(true);
	}
}

export async function deactivate(): Promise<void> {
	if (client) {
		await client.stop();
	}
}
