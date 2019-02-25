# MethodScriptVSC README

This is the official Visual Studio Code IDE for MethodScript. Generally, this code should not be used directly, the extension should be downloaded
directly from the Marketplace. First, download Visual Studio Code, then find the MethodScriptVSC extension.

## Features

The IDE allows you to more easily code in MethodScript. More than just syntax highlighting, the IDE will highlight errors for you as you code, so
you don't need to compile the code just to find out something is wrong. Get information about functions, events, and objects, all without leaving
the IDE. The functions and highlighting are based on your local copy of MethodScript, which will also include help for extensions and whatever
version you're currently running, even if the information on methodscript.com is for another version.

## Requirements

You must be able to run MethodScript from the commandline to get this to work. Java must be installed, and you must have already downloaded the
MethodScript/CommandHelper jar file.

## Release Notes

See [CHANGELOG.md](CHANGELOG.md) for release notes.

## Building and running locally

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