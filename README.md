# MethodScriptVSC README

This is the official Visual Studio Code IDE for MethodScript. Generally, this code should not be used directly, the extension should be downloaded
directly from the Marketplace. First, download Visual Studio Code, then find the MethodScriptVSC extension.

On first run, you will be prompted to link to your jar. This will need to be re-linked if you wish to compile against a different jar, or if the
file is moved. If no profile is selected, the plugin should prompt you, but to manually select the profile, use ctrl+shift+p and run
"Choose MethodScript Profile". You may be prompted to update the jar if you are on a very old version, as this extension only works with
the latest versions.

## Features

The IDE allows you to more easily code in MethodScript. More than just syntax highlighting, ~~the IDE will highlight errors for you as you code, so
you don't need to compile the code just to find out something is wrong~~ (coming soon!). Get information about functions, events, and objects, all without leaving
the IDE. The functions and highlighting are based on your local copy of MethodScript, which will also include help for extensions and whatever
version you're currently running, even if the information on methodscript.com is for another version.

## Requirements

You must be able to run MethodScript from the commandline to get this to work. Java must be installed, and you must have already downloaded the
MethodScript/CommandHelper jar file.

## Release Notes

See [CHANGELOG.md](CHANGELOG.md) for release notes.

## Dev Info

- Download Visual Studio Code ([Free Download](https://code.visualstudio.com/Download) for Mac, Linux, and Windows)
- Install node.js and npm ([Mac, Windows](https://nodejs.org/en/download/)/Debian-based: `sudo apt-get install nodejs npm`)
- Run `npm install` in the root of the project
- Open the project in Visual Studio Code
- Press F5 to open a new window with the extension installed

### Installing globally

To install the extension in your main Visual Studio Code installation, you must first create a VSIX package.
Make sure you install and run from within the sandbox first, then

- `npm install -g vsce`
- From within the project directory: `vsce package`
- This creates methodscript-&lt;version&gt;.vsix in the project root
- Run `code --install-extension methodscript-<version>.vsix` to install in your main installation of Visual Studio Code
- Reload Visual Studio Code

### Uninstalling globally

- Delete the extension folder at the specified location:
    - Windows: `%USERPROFILE%\.vscode\extensions`
    - Mac/Linux: `~/.vscode/extentions`

### Publishing

To publish the version on the marketplace, first ensure that the vsce command is up to date,
so it doesn't fail midway through: `npm install -g vsce`

Then run `vsce publish <version>` where `<version>` is one of `major`,
`minor`, or `patch`. You'll need the Personal Access Token from your organization.

This will publish the version, and create a new commit and release tag. Push the changes
afterwards, `git push`.