// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as exec from 'child_process';
import { API } from './API';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	console.log('methodscriptvsc activated');

	context.subscriptions.push(vscode.commands.registerCommand('extension.msprofile', () => {
		let options : vscode.OpenDialogOptions = {
			canSelectMany: false,
			filters: {
				"Jar Files": ["jar"]
			}
		};
		vscode.window.showOpenDialog(options).then((uri) => {
			if(typeof uri === "undefined") {
				return;
			}
			let jar = uri[0].path.substr(1);
			console.log("Using %o as the jar location", jar);
			let status = vscode.window.setStatusBarMessage("Buffering API from jar");
			exec.exec('java -jar \"' + jar + '\" json-api', {maxBuffer: 1024*1024*1024*200}, (error, stdout, stderr) => {
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
					return;
				}
				var api : API;
				try {
					api = new API(JSON.parse(stdout));
				} catch (e) {
					console.log("API parse failure", e);
					vscode.window.showErrorMessage("Something went wrong, and the API could not be parsed.");
					return;
				}
				console.log("Successfully parsed API");
				vscode.window.setStatusBarMessage("MethodScript Profile loaded: "
					+ api.events.size + " events; "
					+ api.functions.size + " functions; "
					+ api.objects.size + " objects; "
					+ api.keywords.size + " keywords; "
					+ api.extensions.size + " extensions;", 5000);
			});
		});
	}));

}

vscode.languages.registerHoverProvider('mscript', {
	provideHover(document, position, token) {
		return {
			contents: ["Hover Content"]
		};
	}
});

// this method is called when your extension is deactivated
export function deactivate() {}
