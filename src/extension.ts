import * as vscode from 'vscode';
import * as net from 'net';
import * as url from 'url';
import * as exec from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import * as tls from 'tls';
import * as API from './API';
// import * as http from 'http';

import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	StreamInfo,
} from 'vscode-languageclient/node';

const PROFILE_LOCATION : string = "mscript.profile.location";

type LoadMScriptCallback = (success : boolean) => void;

let api : API.API;
let client : LanguageClient | undefined;

export async function loadMscript(context: vscode.ExtensionContext, jar : string, callback : LoadMScriptCallback) {
	// Stop any existing language client before starting a new one
	if(client) {
		await client.stop();
		client = undefined;
	}

	let status = vscode.window.setStatusBarMessage("Buffering API from jar, code hints unavailable until finished...");
	// Re-add this to package.json before uncommenting
	// "methodscript.checkForUpdates": {
	// 	"type": "boolean",
	// 	"default": true,
	// 	"description": "If true, checks for updates of the currently loaded MethodScript profile, and if available, gives you the option to update the jar."
	//   }
	// vscode.window.showInformationMessage("Checking for updates?");
	// if(vscode.workspace.getConfiguration("methodscript").checkForUpdates) {
	// 	vscode.window.showInformationMessage("Checking for updates.");
	// 	var options = {method: 'HEAD', host: 'methodscript.com', port: 443, path: '/MethodScript.jar'};
	// 	var req = http.request(options, function(res) {
	// 		vscode.window.showInformationMessage(JSON.stringify(res.headers));
	// 	});
	// 	req.end();
	// }

	exec.exec('java -Djava.awt.headless=true -jar \"' + jar + '\" json-api', {maxBuffer: 1024*1024*1024*200}, (error, stdout, stderr) => {
		status.dispose();
		console.log("error: ", error);
		console.log("stderr: ", stderr);
		if(error) {
			vscode.window.showErrorMessage("Something went wrong: " + error.message);
		}
		if(stdout.startsWith("Mode json-api was not found.")) {
			// This is what the older versions say when we try to load the api, so let's give a bit better of an
			// error message besides the generic *something went wrong*
			console.log("Too old MethodScript version");
			vscode.window.showErrorMessage("The version of MethodScript that you've selected is too old to work.\n"
				+ "Please select an updated version.");
			callback(false);
			return;
		}
		try {
			api = new API.API(JSON.parse(stdout));
		} catch (e) {
			console.log("API parse failure", e);
			vscode.window.showErrorMessage("Something went wrong, and the API could not be parsed.");
			callback(false);
			return;
		}
		console.log("Successfully parsed API");
		vscode.window.setStatusBarMessage("MethodScript Profile loaded: "
			+ api.events.size + " events; "
			+ api.functions.size + " functions; "
			+ api.objects.size + " objects; "
			+ api.keywords.size + " keywords; "
			+ api.extensions.size + " extensions;", 5000);
		startupLanguageServer(context, jar);
		callback(true);
	});
}

function startupLanguageServer(context: vscode.ExtensionContext, jar : string) : void {

	let client: LanguageClient;

	const serverOptions = () =>
		new Promise<exec.ChildProcess | StreamInfo>((resolve, _reject) => {
			// Use a TCP socket, since that is more prevalent
			const server = net.createServer(socket => {
				console.log('MethodScript process connected');
				socket.on('end', () => {
					console.log('MethodScript process disconnected');
				});
				server.close();
				resolve({ reader: socket, writer: socket });
			});
			// Listen on random port
			server.listen(0, '127.0.0.1', () => {
				let args = [
					"-Djava.awt.headless=true",
				];
				// Get cmdline-args from the jar
				let cmdlineArgs = [
					"-jar", jar, "cmdline-args"
				];

				let output : string = exec.spawnSync("java", cmdlineArgs).stdout.toString().trim();
				if(output.indexOf("Mode cmdline-args was not found") === -1) {
					output.split(" ").forEach(function(value : string, _index : number) {
						if(value === "-Xrs") {
							// We won't be triggering any interrupts, so no need for this one.
							return;
						}
						args.push(value);
					});
				}

				// console.log(vscode.workspace.getConfiguration("methodscript"));
				if(vscode.workspace.getConfiguration("methodscript").langserv.debugModeEnabled) {
					let debugPort : any =  vscode.workspace.getConfiguration("methodscript").langserv.debugPort;
					args.push("-Xdebug", "-Xrunjdwp:transport=dt_socket,server=y,suspend=y,address="
					+ debugPort);
					vscode.window.setStatusBarMessage("Starting MethodScript LangServ in debug mode, awaiting connection");
					vscode.window.showInformationMessage("Awaiting conection from a Java Debugger on port " + debugPort);
				}
				args.push("-jar");
				args.push(jar);
				args.push('lang-serv');
				args.push('--host');
				args.push('127.0.0.1');
				args.push('--port');
				args.push((server.address() as net.AddressInfo).port.toString());
				const childProcess = exec.spawn("java", args);
				childProcess.stderr.on('data', (chunk: Buffer) => {
					const str = chunk.toString();
					console.log('MethodScript Language Server stderr:', str);
					client.outputChannel.appendLine(str);
				});
				childProcess.stdout.on('data', (chunk: Buffer) => {
					const str = chunk.toString();
					if(str.indexOf("Mode lang-serv was not found") !== -1) {
						// Old version, inform the user to update
						vscode.window.showInformationMessage("Too old a version of MethodScript, please update your jar"
							+ " to unlock the full potential of the MethodScriptVSC extension, including code completion"
							+ " and error checking!");
						return;
					}
					console.log('MethodScript Language Server stdout:', str);
					client.outputChannel.appendLine(str);
				});
				childProcess.on('exit', (code, signal) => {
					if (code !== 0) {
						client.outputChannel.appendLine(
							`Language server exited ` + (signal ? `f5rom signal ${signal}` : `with exit code ${code}`)
						);
						client.outputChannel.show();
					}
				});
				return childProcess;
			});
		});

	// Options to control the language client
	const clientOptions: LanguageClientOptions = {
		// Register the server for MethodScript documents
		documentSelector: [{ scheme: 'file', language: 'mscript' }, { scheme: 'untitled', language: 'mscript' }],
		uriConverters: {
			// VS Code by default %-encodes even the colon after the drive letter
			// NodeJS handles it much better
			code2Protocol: uri => url.format(url.parse(uri.toString(true))),
			protocol2Code: str => vscode.Uri.parse(str),
		},
		synchronize: {
			// Notify the server about changes to MethodScript files in the workspace
			fileEvents: vscode.workspace.createFileSystemWatcher('**/*.msa?'),
		},
	};

	// Create the language client and start the client.
	client = new LanguageClient('MethodScript Language Server', serverOptions, clientOptions);
	client.start();

	// Push the client to the context's subscriptions so that the
	// client can be deactivated on extension deactivation
	context.subscriptions.push(client);
}

export function pickProfile(global: boolean, context : vscode.ExtensionContext, callback : LoadMScriptCallback) {
	let options : vscode.OpenDialogOptions = {
		canSelectMany: false,
		filters: {
			"Jar Files": ["jar"]
		}
	};
	vscode.window.showOpenDialog(options).then((uri) => {
		if(typeof uri === "undefined") {
			callback(false);
			return;
		}
		console.log("uri is");
		console.log(uri);
		
		let jar = "";
		if(uri[0].path.match(/\/[a-zA-Z]:\//)) {
			// Windows file paths look like "/C:/blah". In this case, we need to remove the leading /
			jar = uri[0].path.substr(1);
		} else {
			jar = uri[0].path;
		}
		console.log("Using this as the jar location:", jar);
		loadMscript(context, jar, function(success : boolean) {
			if(success) {
				console.log("Saving " + jar + " to " + PROFILE_LOCATION + " in the " + (global ? "global" : "workspace") + "State");
				(global ? context.globalState : context.workspaceState).update(PROFILE_LOCATION, jar);
			}
			callback(success);
		});
	});
}

export function activate(context: vscode.ExtensionContext) {
	console.log('methodscriptvsc activated');
	let profileLocation = context.workspaceState.get(PROFILE_LOCATION);
	if(typeof(profileLocation) === "undefined") {
		profileLocation = context.globalState.get(PROFILE_LOCATION);
	}
	if(typeof(profileLocation) === "undefined") {
		vscode.window.showInformationMessage("No MethodScript profile is loaded. Choose the location of the MethodScript/CommandHelper jar of your installation.", "Click here to load.")
			.then(function(_value){
				pickProfile(true, context, function(success : boolean) {
					if(success) {
						vscode.window.showInformationMessage("Profile selected. If you wish to change the profile in the future,"
							+ " run the \"Choose MethodScript Profile\" command.");
					} else {
						vscode.window.showErrorMessage("Profile was not selected. To try again, run the \"Choose * MethodScript Profile\" command.");
					}
				});
			});
	} else {
		loadMscript(context, context.globalState.get(PROFILE_LOCATION) as string, function(success : boolean) {
			if(!success) {
				vscode.window.showErrorMessage("The stored MethodScript profile could not be loaded.", "Click here to load again.")
					.then(function(_value) {
						pickProfile(true, context, function(success : boolean) {
							if(!success) {
								vscode.window.showErrorMessage("Profile could not be loaded. Fix the errors, then try"
									+ " again with the \"Choose * MethodScript Profile\" command");
							}
						});
					});
			}
		});
	}

	context.subscriptions.push(vscode.commands.registerCommand('extension.globalmsprofile', () => {
		pickProfile(true, context, function(_success: boolean) {});
	}));

	context.subscriptions.push(vscode.commands.registerCommand('extension.workspacemsprofile', () => {
		pickProfile(false, context, function(_success: boolean) {});
	}));

	context.subscriptions.push(
		vscode.debug.registerDebugAdapterDescriptorFactory('mscript',
			new MSDebugAdapterFactory(context))
	);

	context.subscriptions.push(
		vscode.debug.registerDebugConfigurationProvider('mscript',
			new MSDebugConfigurationProvider(context))
	);
}

vscode.languages.registerHoverProvider('mscript', {
	provideHover: function(document : any, position : any, _token : any) : vscode.ProviderResult<vscode.Hover> {
		var word : vscode.Range = document.getWordRangeAtPosition(position) as vscode.Range;
		var line : string = document.lineAt(position.line).text;
		line = line.substr(word.start.character, word.end.character - word.start.character);
		var contents : string;
		if(api.objects.has(line)) {
			let o : API.APIObject = api.objects.get(line) as API.APIObject;
			contents = "class " + o.type + " extends " + o.superclasses.join(",") + (
				o.interfaces.length > 0 ? " implements " + o.interfaces.join(",") : ""
			) + ";\n\n" + o.docs;
		} else if(api.events.has(line)) {
			let e : API.APIEvent = api.events.get(line) as API.APIEvent;
			contents = e.desc + "\n\nEvent Data:\n";
			e.eventData.forEach((item) => {
				contents += "* " + item.name + (item.desc !== "" ? " - " + item.desc : "") + "\n";
			});
			contents += "\n\nPrefilters:\n";
			e.prefilters.forEach((item) => {
				contents += "* " + item.name + " - " + item.type + "\n";
			});
			contents += "\n\nMutable:\n";
			e.mutability.forEach((item) => {
				contents += "* " + item.name + (item.desc !== "" ? " - " + item.desc : "") + "\n";
			});
		} else if(api.functions.has(line)) {
			let f : API.APIFunction = api.functions.get(line) as API.APIFunction;
			contents = (f.shortdesc === null ? f.desc : f.shortdesc) + "\n\n" + f.args;
		} else if(api.keywords.has(line)) {
			let k : API.APIKeyword = api.keywords.get(line) as API.APIKeyword;
			contents = k.docs;
		} else {
			return undefined;
		}
		return new vscode.Hover(new vscode.MarkdownString(contents));
	}
});

// this method is called when your extension is deactivated
export function deactivate() {
	if(client) {
		client.stop();
	}
}

const DEFAULT_DEBUG_PORT = 6732;

class MSDebugConfigurationProvider implements vscode.DebugConfigurationProvider {

	private context: vscode.ExtensionContext;
	private runTerminal: vscode.Terminal | undefined;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
		vscode.window.onDidCloseTerminal(t => {
			if(t === this.runTerminal) {
				this.runTerminal = undefined;
			}
		});
	}

	resolveDebugConfiguration(
		_folder: vscode.WorkspaceFolder | undefined,
		config: vscode.DebugConfiguration,
		_token?: vscode.CancellationToken
	): vscode.ProviderResult<vscode.DebugConfiguration> {
		// If F5 is pressed with no launch.json or an empty config, fill in defaults
		if(!config.type && !config.request && !config.name) {
			const editor = vscode.window.activeTextEditor;
			if(editor && editor.document.languageId === 'mscript') {
				// Show a quick-pick so the user can choose launch vs attach
				return this.pickDebugMode(editor);
			}
		}

		if(config.request === 'attach') {
			// Attach mode only needs host and port
			config.host = config.host || '127.0.0.1';
			config.port = config.port || DEFAULT_DEBUG_PORT;
			return config;
		}

		if(!config.program) {
			vscode.window.showErrorMessage('No MethodScript file to debug. Open a .ms file and try again.');
			return undefined;
		}

		// "Run Without Debugging" — launch in a terminal, skip the debug adapter entirely
		if(config.noDebug) {
			const jar = config.jar
				|| this.context.workspaceState.get(PROFILE_LOCATION) as string
				|| this.context.globalState.get(PROFILE_LOCATION) as string;
			if(!jar) {
				vscode.window.showErrorMessage(
					'No MethodScript jar configured. Set "jar" in launch.json or load a profile first.');
				return undefined;
			}
			let jvmArgs: string[] = [];
			let cmdlineArgs = ['-jar', jar, 'cmdline-args'];
			let output: string = exec.spawnSync('java', cmdlineArgs).stdout.toString().trim();
			if(output.indexOf('Mode cmdline-args was not found') === -1) {
				output.split(' ').forEach(function(value: string) {
					if(value === '-Xrs') {
						return;
					}
					jvmArgs.push(value);
				});
			}
			const allArgs = [...jvmArgs, '-jar', jar, 'cmdline', config.program];
			const cmd = ['java', ...allArgs.map(a => a.includes(' ') ? `"${a}"` : a)].join(' ');
			if(!this.runTerminal) {
				this.runTerminal = vscode.window.createTerminal({ name: 'MethodScript' });
			}
			this.runTerminal.show();
			this.runTerminal.sendText(cmd);
			return undefined;
		}

		return config;
	}

	private async pickDebugMode(
		editor: vscode.TextEditor
	): Promise<vscode.DebugConfiguration | undefined> {
		const choice = await vscode.window.showQuickPick(
			[
				{ label: '$(debug-alt) Launch', description: 'Start and debug the current file', value: 'launch' },
				{ label: '$(plug) Attach', description: 'Attach to a running debug server', value: 'attach' }
			],
			{ placeHolder: 'How do you want to debug?' }
		);
		if(!choice) {
			return undefined;
		}
		if(choice.value === 'attach') {
			const attachConfig = await this.promptForAttachConfig();
			if(!attachConfig) {
				return undefined;
			}
			// Cancel this session and start a fresh attach session so VS Code
			// properly initializes it as an attach request from the start.
			vscode.debug.startDebugging(undefined, attachConfig);
			return undefined;
		}
		return {
			type: 'mscript',
			name: 'Debug MethodScript',
			request: 'launch',
			program: editor.document.uri.fsPath,
			debugPort: DEFAULT_DEBUG_PORT
		};
	}

	private promptForAttachConfig(): Promise<vscode.DebugConfiguration | undefined> {
		return new Promise((resolve) => {
			const panel = vscode.window.createWebviewPanel(
				'mscriptAttach',
				'Attach to MethodScript',
				vscode.ViewColumn.Active,
				{ enableScripts: true }
			);

			const saved = {
				host: this.context.globalState.get<string>('msDebugHost', '127.0.0.1'),
				port: this.context.globalState.get<number>('msDebugPort', DEFAULT_DEBUG_PORT),
				security: this.context.globalState.get<string>('msDebugSecurity', 'none'),
				privateKeyPath: this.context.globalState.get<string>('msDebugKeyPath', '')
			};

			let resolved = false;
			panel.webview.html = this.getAttachFormHtml(saved);

			panel.webview.onDidReceiveMessage((msg) => {
				if(msg.command === 'attach') {
					resolved = true;
					panel.dispose();
					this.context.globalState.update('msDebugHost', msg.host);
					this.context.globalState.update('msDebugPort', parseInt(msg.port, 10));
					this.context.globalState.update('msDebugSecurity', msg.security);
					if(msg.privateKeyPath) {
						this.context.globalState.update('msDebugKeyPath', msg.privateKeyPath);
					}
					const config: vscode.DebugConfiguration = {
						type: 'mscript',
						name: 'Attach to MethodScript',
						request: 'attach',
						host: msg.host,
						port: parseInt(msg.port, 10),
						security: msg.security
					};
					if(msg.security === 'keypair' && msg.privateKeyPath) {
						config.privateKeyPath = msg.privateKeyPath;
					}
					resolve(config);
				} else if(msg.command === 'cancel') {
					resolved = true;
					panel.dispose();
					resolve(undefined);
				} else if(msg.command === 'browseKey') {
					vscode.window.showOpenDialog({
						title: 'Select private key file',
						canSelectMany: false,
						openLabel: 'Use Key',
						filters: { 'All Files': ['*'] }
					}).then(uris => {
						if(uris && uris.length > 0) {
							panel.webview.postMessage({
								command: 'keySelected',
								path: uris[0].fsPath
							});
						}
					});
				}
			});

			panel.onDidDispose(() => {
				if(!resolved) {
					resolve(undefined);
				}
			});
		});
	}

	private getAttachFormHtml(saved: { host: string; port: number; security: string; privateKeyPath: string }): string {
		const keypairSelected = saved.security === 'keypair';
		return `<!DOCTYPE html>
<html>
<head>
<style>
	body {
		font-family: var(--vscode-font-family);
		font-size: var(--vscode-font-size);
		color: var(--vscode-foreground);
		padding: 20px;
		max-width: 500px;
		margin: 0 auto;
	}
	h2 { margin-top: 0; }
	label {
		display: block;
		margin-top: 12px;
		margin-bottom: 4px;
		font-weight: bold;
	}
	input[type="text"], input[type="number"], select {
		width: 100%;
		padding: 6px 8px;
		box-sizing: border-box;
		background: var(--vscode-input-background);
		color: var(--vscode-input-foreground);
		border: 1px solid var(--vscode-input-border, transparent);
		border-radius: 2px;
	}
	input:focus, select:focus {
		outline: 1px solid var(--vscode-focusBorder);
	}
	.key-row {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.key-row input { flex: 1; }
	.keypair-fields { display: none; }
	.keypair-fields.visible { display: block; }
	.buttons {
		margin-top: 20px;
		display: flex;
		gap: 8px;
		justify-content: flex-end;
	}
	button {
		padding: 6px 16px;
		border: none;
		border-radius: 2px;
		cursor: pointer;
		font-size: var(--vscode-font-size);
	}
	button.primary {
		background: var(--vscode-button-background);
		color: var(--vscode-button-foreground);
	}
	button.primary:hover {
		background: var(--vscode-button-hoverBackground);
	}
	button.secondary {
		background: var(--vscode-button-secondaryBackground);
		color: var(--vscode-button-secondaryForeground);
	}
	button.secondary:hover {
		background: var(--vscode-button-secondaryHoverBackground);
	}
	button.browse {
		background: var(--vscode-button-secondaryBackground);
		color: var(--vscode-button-secondaryForeground);
		padding: 6px 10px;
		white-space: nowrap;
	}
	.description {
		font-size: 0.9em;
		color: var(--vscode-descriptionForeground);
		margin-top: 2px;
	}
</style>
</head>
<body>
	<h2>Attach to MethodScript Debug Server</h2>

	<label for="host">Host</label>
	<input type="text" id="host" value="${saved.host}" />

	<label for="port">Port</label>
	<input type="number" id="port" value="${saved.port}" min="1" max="65535" />

	<label for="security">Security</label>
	<select id="security">
		<option value="none"${keypairSelected ? '' : ' selected'}>None (no authentication or encryption)</option>
		<option value="keypair"${keypairSelected ? ' selected' : ''}>Keypair (SSH-style authentication)</option>
	</select>

	<div id="keypairFields" class="keypair-fields${keypairSelected ? ' visible' : ''}">
		<label for="privateKeyPath">Private Key</label>
		<div class="key-row">
			<input type="text" id="privateKeyPath" value="${saved.privateKeyPath}" placeholder="Auto-detect from ~/.ssh/" />
			<button class="browse" onclick="browseKey()">Browse...</button>
		</div>
		<div class="description">Leave blank to auto-detect from ~/.ssh/</div>
	</div>

	<div class="buttons">
		<button class="secondary" onclick="cancel()">Cancel</button>
		<button class="primary" onclick="attach()">Attach</button>
	</div>

	<script>
		const vscode = acquireVsCodeApi();

		document.getElementById('security').addEventListener('change', function() {
			const fields = document.getElementById('keypairFields');
			fields.className = this.value === 'keypair'
				? 'keypair-fields visible' : 'keypair-fields';
		});

		function attach() {
			vscode.postMessage({
				command: 'attach',
				host: document.getElementById('host').value,
				port: document.getElementById('port').value,
				security: document.getElementById('security').value,
				privateKeyPath: document.getElementById('privateKeyPath').value
			});
		}

		function cancel() {
			vscode.postMessage({ command: 'cancel' });
		}

		function browseKey() {
			vscode.postMessage({ command: 'browseKey' });
		}

		window.addEventListener('message', function(event) {
			if(event.data.command === 'keySelected') {
				document.getElementById('privateKeyPath').value = event.data.path;
			}
		});

		// Allow Enter to submit
		document.addEventListener('keydown', function(e) {
			if(e.key === 'Enter') { attach(); }
			if(e.key === 'Escape') { cancel(); }
		});
	</script>
</body>
</html>`;
	}
}

class MSDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {

	private context: vscode.ExtensionContext;
	private outputChannel: vscode.OutputChannel;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
		this.outputChannel = vscode.window.createOutputChannel('MethodScript Debug');
	}

	createDebugAdapterDescriptor(
		session: vscode.DebugSession,
		_executable: vscode.DebugAdapterExecutable | undefined
	): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
		const config = session.configuration;

		if(config.request === 'attach') {
			const host = config.host || '127.0.0.1';
			const port = config.port || DEFAULT_DEBUG_PORT;
			const security = (config.security || 'none').toLowerCase();

			if(security === 'keypair') {
				return this.attachWithKeypair(host, port, config.privateKeyPath);
			}
			// NONE mode: connect and check whether the server is actually
			// expecting KEYPAIR authentication before handing off to DAP.
			return new Promise<vscode.DebugAdapterDescriptor>((resolve, reject) => {
				let resolved = false;
				const socket = net.createConnection({ host, port }, () => {
					// Read the first few bytes to detect if the server sent
					// KEYPAIR handshake magic instead of DAP content.
					const noneTimeout = setTimeout(() => {
						if(!resolved) {
							resolved = true;
							socket.destroy();
							reject(new Error(
								`No response from debug server at ${host}:${port} within 10 seconds. `
								+ 'Make sure the server is running with debugging enabled.'));
						}
					}, 10000);
					const onFirstData = (data: Buffer) => {
						socket.removeListener('data', onFirstData);
						clearTimeout(noneTimeout);
						if(resolved) {
							return;
						}
						resolved = true;
						if(data.length >= HANDSHAKE_MAGIC.length
								&& data.subarray(0, HANDSHAKE_MAGIC.length).equals(HANDSHAKE_MAGIC)) {
							socket.destroy();
							const msg = `The debug server at ${host}:${port} requires KEYPAIR `
								+ 'authentication, but the client is configured for NONE. '
								+ 'Change the security mode to KEYPAIR and provide a private key.';
							vscode.window.showErrorMessage(msg);
							reject(new Error(msg));
							return;
						}
						// Not MAGIC - it's normal DAP data. Push it back by
						// unshifting into the socket so SocketDebugAdapter
						// processes it, then resolve.
						socket.unshift(data);
						resolve(new vscode.DebugAdapterInlineImplementation(
							new SocketDebugAdapter(socket)));
					};
					socket.once('data', onFirstData);
				});
				socket.on('error', (err: NodeJS.ErrnoException) => {
					if(resolved) {
						return;
					}
					resolved = true;
					if(err.code === 'ECONNREFUSED') {
						vscode.window.showErrorMessage(
							`Could not connect to debug server at ${host}:${port}. `
							+ 'Make sure the MethodScript process is running with --debug enabled.');
					} else {
						vscode.window.showErrorMessage(
							`Failed to connect to debug server at ${host}:${port}: ${err.message}`);
					}
					reject(err);
				});
			});
		}

		// Launch mode
		const jar = config.jar
			|| this.context.workspaceState.get(PROFILE_LOCATION) as string
			|| this.context.globalState.get(PROFILE_LOCATION) as string;
		if(!jar) {
			vscode.window.showErrorMessage(
				'No MethodScript jar configured. Set "jar" in launch.json or load a profile first.');
			return undefined;
		}

		const program = config.program;
		if(!program) {
			vscode.window.showErrorMessage('No "program" specified in launch configuration.');
			return undefined;
		}

		const port = config.debugPort || DEFAULT_DEBUG_PORT;

		const debugModeEnabled = vscode.workspace.getConfiguration("methodscript").debugAdapter.debugModeEnabled;

		const threadingMode: string = vscode.workspace.getConfiguration("methodscript").debugAdapter.threadingMode || "default";

		const launchPromise = new Promise<vscode.DebugAdapterDescriptor>((resolve, reject) => {
			// Get required JVM args from the jar (same pattern as language server launch)
			let jvmArgs: string[] = [];
			let cmdlineArgs = ['-jar', jar, 'cmdline-args'];
			let output: string = exec.spawnSync('java', cmdlineArgs).stdout.toString().trim();
			if(output.indexOf('Mode cmdline-args was not found') === -1) {
				output.split(' ').forEach(function(value: string) {
					if(value === '-Xrs') {
						return;
					}
					jvmArgs.push(value);
				});
			}

			if(debugModeEnabled) {
				let jdwpPort: any = vscode.workspace.getConfiguration("methodscript").debugAdapter.debugPort;
				jvmArgs.push("-Xdebug", "-Xrunjdwp:transport=dt_socket,server=y,suspend=y,address="
					+ jdwpPort);
			}

			const debugArgs = config.noDebug ? [] : [
				'--debug',
				'--debug-port', port.toString(),
				'--debug-suspend',
				'--debug-security', 'NONE',
				...(threadingMode !== 'default' ? ['--debug-threading-mode', threadingMode] : [])
			];

			const args = [
				...jvmArgs,
				'-jar', jar,
				'cmdline', program,
				...debugArgs
			];

			const childProcess = exec.spawn('java', args);
			let resolved = false;
			console.log('MethodScript Debug: spawned java with args:', args.join(' '));
			childProcess.stderr.on('data', (chunk: Buffer) => {
				const str = chunk.toString();
				console.log('MethodScript Debug Server stderr:', str);
				this.outputChannel.append(str);
				if(!resolved && str.indexOf('debugger listening on') !== -1) {
					resolved = true;
					resolve(new vscode.DebugAdapterServer(port, '127.0.0.1'));
				}
			});
			childProcess.stdout.on('data', (chunk: Buffer) => {
				const str = chunk.toString();
				console.log('MethodScript Debug Server stdout:', str);
				this.outputChannel.append(str);
			});
			childProcess.on('error', (err: Error) => {
				console.log('MethodScript Debug Server spawn error:', err.message);
				if(!resolved) {
					reject(err);
				}
			});
			childProcess.on('exit', (code, signal) => {
				console.log('MethodScript Debug Server exited, code:', code, 'signal:', signal);
				if(!resolved && code !== 0) {
					reject(new Error('Debug server exited with code ' + code));
				}
			});

			let timeoutMs = debugModeEnabled ? 300000 : 10000;
			setTimeout(() => {
				if(!resolved) {
					console.log('MethodScript Debug Server: timeout waiting for startup');
					reject(new Error('Debug server did not start in time'));
				}
			}, timeoutMs);
		});

		const statusBarMsg = debugModeEnabled
			? "Starting MethodScript debugger with Java Debugging, awaiting connection"
			: "Starting MethodScript debugger, awaiting connection";
		const statusBarItem = vscode.window.setStatusBarMessage(statusBarMsg);
		const cleanPromise = launchPromise.finally(() => statusBarItem.dispose());

		if(debugModeEnabled) {
			return vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: "Awaiting connection from a Java Debugger on port "
					+ vscode.workspace.getConfiguration("methodscript").debugAdapter.debugPort,
				cancellable: false
			}, () => cleanPromise);
		} else {
			return cleanPromise;
		}
	}

	private async attachWithKeypair(
		host: string, port: number, privateKeyPath?: string
	): Promise<vscode.DebugAdapterDescriptor> {
		// Find the private key
		const keyPath = privateKeyPath || findPrivateKey();
		if(!keyPath) {
			throw new Error(
				'No private key found. Set "privateKeyPath" in launch.json or place a key in ~/.ssh/.');
		}
		const privateKeyPem = fs.readFileSync(keyPath, 'utf8');

		// Also need the public key to send to the server
		const pubKeyPath = keyPath + '.pub';
		if(!fs.existsSync(pubKeyPath)) {
			throw new Error('Public key not found at ' + pubKeyPath
				+ '. The .pub file must exist alongside the private key.');
		}
		const publicKeyStr = fs.readFileSync(pubKeyPath, 'utf8').trim();

		// Connect and perform the handshake
		const socket = await connectAndAuthenticate(host, port, privateKeyPem, publicKeyStr);
		this.outputChannel.appendLine('KEYPAIR authentication successful to ' + host + ':' + port);

		// Wrap the authenticated socket in a DebugAdapter
		return new vscode.DebugAdapterInlineImplementation(
			new SocketDebugAdapter(socket));
	}
}

/**
 * Searches ~/.ssh/ for a private key file. Returns the path to the first
 * key found, or undefined if none exist.
 */
function findPrivateKey(): string | undefined {
	const sshDir = path.join(os.homedir(), '.ssh');
	const candidates = ['id_ed25519', 'id_ecdsa', 'id_rsa'];
	for(const name of candidates) {
		const keyPath = path.join(sshDir, name);
		if(fs.existsSync(keyPath)) {
			return keyPath;
		}
	}
	return undefined;
}

/**
 * The magic bytes the server sends to identify the handshake protocol.
 * Must match DebugAuthenticator.MAGIC on the Java side:
 * {'M', 'S', 'D', 'B', 'G', 0x01}
 */
const HANDSHAKE_MAGIC = Buffer.from([0x4D, 0x53, 0x44, 0x42, 0x47, 0x01]);

/**
 * Connects to the debug server, performs the KEYPAIR authentication handshake,
 * and returns the authenticated socket ready for DAP traffic.
 *
 * Protocol:
 * 1. Server sends: MAGIC (6 bytes) + nonce_length (int32 BE) + nonce
 * 2. Client sends: signature_length (int32 BE) + signature + pubkey_length (int32 BE) + pubkey
 * 3. Server sends: result byte (0x01 = success, 0x00 = failure + error message)
 */
function connectAndAuthenticate(
	host: string, port: number, privateKeyPem: string, publicKeyStr: string
): Promise<net.Socket> {
	return new Promise((resolve, reject) => {
		let handshakeDone = false;
		const socket = net.createConnection({ host, port }, () => {
			let buffer = Buffer.alloc(0);
			let receivedData = false;

			// A KEYPAIR server sends MAGIC bytes immediately on accept.
			// If nothing arrives within 2 seconds, the server is almost
			// certainly running in NONE mode.
			const magicTimeout = setTimeout(() => {
				if(!receivedData && !handshakeDone) {
					handshakeDone = true;
					socket.destroy();
					reject(new Error(
						'The debug server does not appear to be using KEYPAIR authentication. '
						+ 'No handshake was initiated by the server. '
						+ 'Check that the security mode matches on both sides.'));
				}
			}, 2000);

			socket.on('data', function onHandshakeData(chunk: Buffer) {
				if(handshakeDone) {
					return;
				}
				receivedData = true;
				clearTimeout(magicTimeout);
				buffer = Buffer.concat([buffer, chunk]);

				// Phase 1: Read magic (6 bytes) + nonce length (4 bytes) + nonce
				if(buffer.length < HANDSHAKE_MAGIC.length + 4) {
					return;
				}
				const magic = buffer.subarray(0, HANDSHAKE_MAGIC.length);
				if(!magic.equals(HANDSHAKE_MAGIC)) {
					handshakeDone = true;
					socket.removeListener('data', onHandshakeData);
					socket.destroy();
					reject(new Error(
						'The debug server does not appear to be using KEYPAIR authentication. '
						+ 'It may be configured for NONE. '
						+ 'Change the security mode in the attach dialog to match the server.'));
					return;
				}

				const nonceLen = buffer.readInt32BE(HANDSHAKE_MAGIC.length);
				if(nonceLen < 0 || nonceLen > 65536) {
					handshakeDone = true;
					socket.removeListener('data', onHandshakeData);
					socket.destroy();
					reject(new Error('Invalid nonce length from server: ' + nonceLen));
					return;
				}
				const nonceStart = HANDSHAKE_MAGIC.length + 4;
				if(buffer.length < nonceStart + nonceLen) {
					return;
				}
				const nonce = buffer.subarray(nonceStart, nonceStart + nonceLen);
				const remaining = buffer.subarray(nonceStart + nonceLen);

				// Phase 2: Sign the nonce and send signature + public key
				let signature: Buffer;
				try {
					// crypto.sign auto-detects the key type from the PEM.
					// Ed25519 requires null algorithm; RSA and ECDSA use SHA256.
					const keyType = publicKeyStr.split(/\s+/)[0];
					const algorithm = keyType === 'ssh-ed25519' ? null : 'SHA256';
					signature = crypto.sign(algorithm, nonce, privateKeyPem);
				} catch(e: any) {
					handshakeDone = true;
					socket.removeListener('data', onHandshakeData);
					socket.destroy();
					reject(new Error('Failed to sign nonce: ' + e.message));
					return;
				}

				const pubKeyBytes = Buffer.from(publicKeyStr, 'utf8');
				const response = Buffer.alloc(4 + signature.length + 4 + pubKeyBytes.length);
				response.writeInt32BE(signature.length, 0);
				signature.copy(response, 4);
				response.writeInt32BE(pubKeyBytes.length, 4 + signature.length);
				pubKeyBytes.copy(response, 4 + signature.length + 4);
				socket.write(response);

				// Phase 3: Read the auth result
				// Remove the Phase 1/2 handler before waiting for the result
				socket.removeListener('data', onHandshakeData);
				buffer = remaining;

				const checkResult = () => {
					if(buffer.length < 1) {
						return false;
					}
					const resultByte = buffer[0];
					handshakeDone = true;

					if(resultByte === 0x01) {
						const leftover = buffer.subarray(1);
						if(leftover.length > 0) {
							socket.unshift(leftover);
						}
						// Upgrade to TLS before handing the socket to DAP
						const tlsSocket = tls.connect({
							socket: socket,
							rejectUnauthorized: false
						});
						tlsSocket.on('secureConnect', () => {
							resolve(tlsSocket);
						});
						tlsSocket.on('error', (err: Error) => {
							reject(new Error('TLS handshake failed: ' + err.message));
						});
					} else {
						if(buffer.length < 5) {
							socket.destroy();
							reject(new Error('Authentication failed (no details from server)'));
							return true;
						}
						const msgLen = buffer.readInt32BE(1);
						if(buffer.length < 5 + msgLen) {
							socket.destroy();
							reject(new Error('Authentication failed (truncated error)'));
							return true;
						}
						const msg = buffer.subarray(5, 5 + msgLen).toString('utf8');
						socket.destroy();
						reject(new Error('Authentication failed: ' + msg));
					}
					return true;
				};

				if(!checkResult()) {
					socket.on('data', function onResultData(chunk: Buffer) {
						buffer = Buffer.concat([buffer, chunk]);
						if(checkResult()) {
							socket.removeListener('data', onResultData);
						}
					});
				}
			});

			setTimeout(() => {
				if(!handshakeDone) {
					socket.destroy();
					reject(new Error(
						'Authentication handshake timed out. '
						+ 'The server may not be using KEYPAIR authentication. '
						+ 'Check that the security mode matches on both sides.'));
				}
			}, 10000);
		});

		socket.on('error', (err: Error) => {
			reject(new Error('Failed to connect to debug server: ' + err.message));
		});
	});
}

/**
 * A VS Code DebugAdapter that forwards DAP messages over an already-connected
 * (and authenticated) socket. Used after a pre-DAP handshake so VS Code can
 * speak DAP on the socket normally.
 */
class SocketDebugAdapter implements vscode.DebugAdapter {
	private sendMessageEmitter = new vscode.EventEmitter<vscode.DebugProtocolMessage>();
	readonly onDidSendMessage: vscode.Event<vscode.DebugProtocolMessage> = this.sendMessageEmitter.event;
	private socket: net.Socket;
	private rawData = Buffer.alloc(0);
	private contentLength = -1;
	private receivedTerminated = false;
	private sentDisconnect = false;

	constructor(socket: net.Socket) {
		this.socket = socket;

		socket.on('data', (data: Buffer) => {
			this.handleData(data);
		});

		socket.on('close', () => {
			if(!this.receivedTerminated && !this.sentDisconnect) {
				vscode.window.showErrorMessage(
					'Debug server connection lost unexpectedly.');
			}
			this.sendMessageEmitter.fire(
				{ type: 'event', event: 'terminated', seq: 0 } as any);
		});

		socket.on('error', (err: Error) => {
			console.error('SocketDebugAdapter error:', err.message);
		});
	}

	handleMessage(message: vscode.DebugProtocolMessage): void {
		const msg = message as any;
		if(msg.type === 'request' && msg.command === 'disconnect') {
			this.sentDisconnect = true;
		}
		const json = JSON.stringify(message);
		const header = 'Content-Length: ' + Buffer.byteLength(json, 'utf8') + '\r\n\r\n';
		this.socket.write(header + json, 'utf8');
	}

	private handleData(data: Buffer): void {
		this.rawData = Buffer.concat([this.rawData, data]);

		// eslint-disable-next-line no-constant-condition
		while(true) {
			if(this.contentLength >= 0) {
				if(this.rawData.length >= this.contentLength) {
					const message = this.rawData.subarray(0, this.contentLength).toString('utf8');
					this.rawData = this.rawData.subarray(this.contentLength);
					this.contentLength = -1;
					try {
						const parsed = JSON.parse(message);
						if(parsed.type === 'event' && parsed.event === 'terminated') {
							this.receivedTerminated = true;
						}
						this.sendMessageEmitter.fire(parsed);
					} catch(e) {
						// Malformed JSON, skip
					}
				} else {
					break;
				}
			} else {
				const idx = this.rawData.indexOf('\r\n\r\n');
				if(idx !== -1) {
					const header = this.rawData.subarray(0, idx).toString('utf8');
					const match = header.match(/Content-Length:\s*(\d+)/i);
					if(match) {
						this.contentLength = parseInt(match[1], 10);
						this.rawData = this.rawData.subarray(idx + 4);
					} else {
						break;
					}
				} else {
					break;
				}
			}
		}
	}

	dispose(): void {
		this.socket.destroy();
		this.sendMessageEmitter.dispose();
	}
}
