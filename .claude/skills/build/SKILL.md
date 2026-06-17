---
name: build
description: Build the PoE Vault Treasurer Electron app into a runnable .exe and a Windows installer. Use when the user wants to build, package, make a distributable, or produce an exe/installer for this project.
---

# Build (Electron Forge + Vite)

This project uses **Electron Forge + Vite + TypeScript**. Builds are driven by Forge,
configured in `forge.config.ts`. Adjust that file to change makers, targets, icons, or signing.

## Commands

| Goal | Command | Output |
|------|---------|--------|
| Runnable app (no installer) | `npm run package` | `out/PoE Vault Treasurer-win32-x64/PoE Vault Treasurer.exe` |
| Installer + distributables | `npm run make` | `out/make/squirrel.windows/x64/PoE Vault Treasurer-<version> Setup.exe` |
| Dev run (HMR + DevTools) | `npm start` | live window, no artifact |

The default build target is **Windows x64** (Squirrel installer + zip). `make` runs `package` first,
so it always produces both the raw `.exe` and the `Setup.exe`.

## How to build

1. Run `npm run make` from the project root.
2. When it finishes, report the artifact paths under `out/`. Find them with:
   `find out -name "*.exe" -exec ls -lh {} \;`
3. The runnable exe is in `out/<productName>-win32-x64/`; the installer is in `out/make/squirrel.windows/x64/`.

A clean build takes a few minutes — use a generous timeout (≥ 5 min) when running it.

## Adjusting the build (common tweaks)

Edit **`forge.config.ts`**:
- **App version**: bump `version` in `package.json` — it flows into the installer filename.
- **Makers**: `maker-squirrel` (Win installer), `maker-zip`, `maker-deb`/`maker-rpm` (Linux).
  Remove or add entries in the `makers` array to change what `make` produces.
- **App icon**: set `packagerConfig.icon` (path without extension; Forge picks `.ico`/`.icns`).
- **Cross-platform**: add `--platform`/`--arch`, e.g. `npm run make -- --platform=darwin`.
  Note: building for macOS/Linux generally requires building on that OS.
- **Code signing**: add `osxSign`/`osxNotarize` or `windowsSign` under `packagerConfig`.

After changing makers or targets, do a fresh `npm run make` and confirm the new artifacts appear under `out/`.

## CI release (GitHub Actions)

`.github/workflows/release.yml` builds and publishes a GitHub Release automatically when a
**version tag** is pushed:

```bash
# bump version in package.json first, then:
git tag v0.1.0
git push origin v0.1.0
```

It runs on `windows-latest`, does `npm ci` + `npm run make`, and uploads the Squirrel
`Setup.exe`, `.nupkg`, and `RELEASES` to a release named after the tag. To change what's
published, edit the `files:` glob in that workflow; to build for more platforms, add an
OS matrix (macOS/Linux runners produce the zip / deb / rpm makers).

## Notes
- Build outputs (`out/`, `.vite/`) are git-ignored — never commit them.
- The Squirrel `make` step may print a `DEP0187 fs.existsSync` deprecation warning; it is harmless.
