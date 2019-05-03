// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as exec from 'child_process';
import * as API from './API';

const PROFILE_LOCATION : string = "mscript.profile.location";

type LoadMScriptCallback = (success : boolean) => void;

let api : API.API;

export function loadMscript(jar : string, callback : LoadMScriptCallback) {
	let status = vscode.window.setStatusBarMessage("Buffering API from jar, code hints unavailable until finished...");
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
		callback(true);
	});
}

export function pickProfile(context : vscode.ExtensionContext, callback : LoadMScriptCallback) {
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
		let jar = uri[0].path.substr(1);
		console.log("Using this as the jar location:", jar);
		loadMscript(jar, function(success : boolean) {
			if(success) {
				console.log("Saving " + jar + " to " + PROFILE_LOCATION + " in the globalState");
				context.globalState.update(PROFILE_LOCATION, jar);
			}
			callback(success);
		});
	});
}

export function activate(context: vscode.ExtensionContext) {
	console.log('methodscriptvsc activated');
	let profileLocation = context.globalState.get(PROFILE_LOCATION);
	if(typeof(profileLocation) === "undefined") {
		vscode.window.showInformationMessage("No MethodScript profile is loaded. Choose the location of the MethodScript/CommandHelper jar of your installation.", "Click here to load.")
			.then(function(value){
				pickProfile(context, function(success : boolean) {
					if(success) {
						vscode.window.showInformationMessage("Profile selected. If you wish to change the profile in the future,"
							+ " run the \"Choose MethodScript Profile\" command.");
					} else {
						vscode.window.showErrorMessage("Profile was not selected. To try again, run the \"Choose MethodScript Profile\" command.");
					}
				});
			});
	} else {
		loadMscript(context.globalState.get(PROFILE_LOCATION) as string, function(success : boolean) {
			if(!success) {
				vscode.window.showErrorMessage("The stored MethodScript profile could not be loaded.", "Click here to load again.")
					.then(function(value) {
						pickProfile(context, function(success : boolean) {
							if(!success) {
								vscode.window.showErrorMessage("Profile could not be loaded. Fix the errors, then try"
									+ " again with the \"Choose MethodScript Profile\" command");
							}
						});
					});
			}
		});
	}

	context.subscriptions.push(vscode.commands.registerCommand('extension.msprofile', () => {		
		pickProfile(context, function(success: boolean) {});
	}));

}

vscode.languages.registerHoverProvider('mscript', {
	provideHover: function(document, position, token) : vscode.ProviderResult<vscode.Hover> {
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
export function deactivate() {}
