import * as vscode from 'vscode';
import * as net from 'net';
import * as url from 'url';
import * as exec from 'child_process';
import * as API from './API';
// import * as http from 'http';

import {
	LanguageClient,
	LanguageClientOptions,
	StreamInfo,
	ServerOptions,
	TransportKind,
	SocketTransport
  } from 'vscode-languageclient';

const PROFILE_LOCATION : string = "mscript.profile.location";

type LoadMScriptCallback = (success : boolean) => void;

let api : API.API;
let client : LanguageClient;

export function loadMscript(context: vscode.ExtensionContext, jar : string, callback : LoadMScriptCallback) {
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
					"-jar",
					jar,
					'lang-serv',
					'--host',
					'127.0.0.1',
					'--port',
					(server.address() as net.AddressInfo).port.toString()
				];
				// console.log(vscode.workspace.getConfiguration("methodscript"));
				if(vscode.workspace.getConfiguration("methodscript").langserv.debugModeEnabled) {
					args.unshift("-Xdebug", "-Xrunjdwp:transport=dt_socket,server=y,suspend=y,address="
						+ vscode.workspace.getConfiguration("methodscript").langserv.debugPort);
				}
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
	const disposable = client.start();

	// Push the disposable to the context's subscriptions so that the
	// client can be deactivated on extension deactivation
	context.subscriptions.push(disposable);
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
	if(client !== null) {
		client.stop();
	}
}
