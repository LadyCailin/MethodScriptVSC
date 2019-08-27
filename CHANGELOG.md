# Change Log
All notable changes to the "methodscriptvsc" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 1.0.1
- Add code completion support.
- Add error checking as you code. Saving the file triggers the code to compile, and highlights the errors directly in Visual Studio Code.

These features are implemented via support for a language server, so future upgrades should be possible without updating the extension, just be sure to keep you jar file up to date!

## 0.3.3
- Improve highlighting accuracy compared to compiler.

## 0.3.0
- Add highlighting for functions, operators, numerics, and labels.

## 0.2.2
- Update tar version.

## 0.2.0
- Function, event, and keyword help is now available when hovering over the item. The profile actually is loaded from the jar, so the
help will be specific to the jar being used.

## 0.1.0
- Initial release of the IDE. The feature list is fairly basic at this point, and only provides syntax highlighting, code completion, and help
topics.