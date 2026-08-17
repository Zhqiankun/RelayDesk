# RelayDesk

RelayDesk is a Windows desktop workspace for keeping web-based relay stations
in one Electron window. Each station has an independent persistent session,
and the shell can hand CC Switch custom-protocol links to the local handler.

## Development

Use Node 22 or newer and pnpm:

```sh
pnpm install
pnpm dev
pnpm typecheck
pnpm build
```

The development command starts Vite and the Electron shell. The production
Windows installer is written to `release/<version>` by `pnpm build`.

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for module boundaries,
acceptance checks, and deferred work. Project-specific agent instructions are
in [AGENTS.md](AGENTS.md).

## Current Scope

- Add, edit, reorder, enable, and remove site entries.
- Keep one active remote site visible at a time.
- Persist site metadata and per-site Chromium sessions locally.
- Preserve HTTP(S) navigation and native `ccswitch://` / `cc-switch://` handoff.

## CC Switch Requirement

When a remote page imports or exports through CC Switch, it opens a custom
protocol link. RelayDesk intercepts that link in the Electron main process and
passes it to Windows with `shell.openExternal`; Windows then resolves the
registered CC Switch handler.

Every target computer must have CC Switch installed with its custom protocol
registered. RelayDesk does not bundle CC Switch or copy API keys. Portable
copies of CC Switch that are not registered with Windows will show the site's
"CC-Switch 未安装或协议处理程序未注册" message until the official CC Switch
installer is run (or its own protocol registration is repaired).

The project intentionally does not merge provider histories, store credentials,
or expose arbitrary local command execution to remote pages.

## Distribution

The Windows installer creates normal Start Menu and desktop shortcuts, plus an
uninstaller entry. Keep `appId` and `productName` unchanged when publishing a
new version, and increase `version` in `package.json`; running the newer NSIS
installer over the existing installation updates the app while preserving
RelayDesk site sessions and metadata. `deleteAppDataOnUninstall` is disabled so
an uninstall does not silently delete login sessions; users can remove that
data separately when a clean reset is needed.

### GitHub Releases Updates

RelayDesk uses GitHub Releases as its update channel. The release workflow
publishes Windows NSIS assets when a `v*` tag is pushed. In the app toolbar,
the download button checks for a newer release, downloads it, and becomes a
restart-and-install action when the package is ready.

To publish a version:

1. Increase `version` in `package.json`.
2. Commit the change and create a matching tag, for example `v0.1.1`.
3. Push the tag to GitHub; Actions publishes the installer and update metadata.

GitHub Packages is not used because it is intended for dependency registries;
GitHub Releases is the native distribution channel for desktop installers.
