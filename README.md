# GenişKapı Browser Windows

GenişKapı is a modern Chromium-based Windows browser project by OxygenForge.

## Current release: 0.3.0

This release adds a Chrome Web Store installation bridge. When a Chrome Web Store extension page exposes an **Add to Chrome** button, GenişKapı replaces the store's Chrome-only presentation with a **GenişKapı'ya ekle** action and routes it through the browser's installer.

## Extension installation

The installer:

- Detects Chrome Web Store extension IDs from detail pages.
- Downloads the published CRX package from Google's extension update service.
- Supports CRX2 and CRX3 container formats.
- Unpacks the extension into GenişKapı's per-user extension directory.
- Loads the unpacked extension into the persistent Electron session.
- Stores installed-extension metadata and restores installed extensions at the next launch.
- Exposes installed-extension list/removal IPC handlers for the browser UI.

Electron itself only loads unpacked extensions; packed `.crx` packages are therefore unpacked before `loadExtension` is called. Not every Chrome extension is guaranteed to work because Electron implements only a subset of Chrome's extension APIs.

## Browser features

- Chromium-powered browsing via Electron
- Chrome-like User-Agent for better site compatibility
- Back / forward / reload / home navigation
- Basic tracker/ad blocking
- Download handling with progress events
- Modern GenişKapı visual identity and motion system
- Portable Windows build

## Build

Run `powershell -ExecutionPolicy Bypass -File BUILD-WINDOWS.ps1` on Windows.

The script installs dependencies and produces a portable Windows executable.

## Status

Active development. The Chrome Web Store integration is best-effort and depends on the extension being compatible with Electron's supported extension APIs.
