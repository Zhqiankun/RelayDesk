# RelayDesk Development Guide

## Product Boundary

RelayDesk reduces tab switching by hosting multiple web relay stations in one
desktop window. Each station remains an independent website with its own
session. RelayDesk does not merge their chat history, models, billing, or
accounts.

The first release optimizes for one active station at a time. Split view,
cross-site search, notifications, and data synchronization are deferred until
real usage proves they are needed.

## Architecture

```text
Vue renderer
  | typed IPC
Preload bridge
  | validated messages
Electron main process
  |-- workspace window and WebContentsView lifecycle
  |-- one persistent session partition per site
  |-- navigation, popup, download, and external-link policy
  |-- cc-switch protocol handoff
Local application data
  |-- site metadata only
  |-- Chromium session data in Electron's userData directory
```

### Renderer

The renderer owns the RelayDesk chrome: sidebar, site list, settings, status,
and empty/error states. It does not directly access Electron, Node, process
execution, or the filesystem.

### Main process

The main process owns native capabilities and the lifetime of remote views. A
site is represented by stable data (`id`, `name`, `url`, `icon`, `partition`)
rather than a Vue component. Enabled views are created and loaded in the
background at startup, then reused when the user switches between sites. Only
the selected view is attached to the window at a time.

### Sessions

Every site receives a persistent partition such as `persist:site-<id>`. This
allows the user to log in once inside RelayDesk while keeping accounts between
sites separate. It intentionally does not reuse Chrome's profile.

### Native handoff

The first integration keeps the site's current mechanism intact:

- `ccswitch://...`, `cc-switch://...`, and `cc_switch://...` are intercepted by
  the `WebContentsView` main-frame and popup navigation handlers.
- RelayDesk normalizes the accepted aliases to `ccswitch://...` and hands the
  URL to Windows with Electron's `shell.openExternal`.
- Windows then looks up the `ccswitch` registration created by CC Switch and
  launches or focuses that app. The RelayDesk installer does not register a
  third-party protocol on the user's behalf.
- `http://127.0.0.1:<port>` and WebSocket calls remain normal page traffic.
- A Chrome extension/native-messaging dependency requires a later, explicit
  preload/main adapter and is not assumed by the shell.

### Updates

The main process owns update checks and installation through `electron-updater`.
The renderer receives typed status events and only requests a restart after a
package has been downloaded. Development mode never contacts the update
provider. GitHub Actions publishes Windows NSIS assets and `latest.yml` to a
GitHub Release for every `v*` tag; the stable `appId` and increasing package
version preserve upgrade compatibility.

## Initial Site Contract

```ts
type SiteConfig = {
  id: string
  name: string
  url: string
  icon?: string
  shortcut?: string
  enabled: boolean
}
```

The configuration file contains no passwords, cookies, API keys, or page
content. Removing a site should offer a separate action to clear its session
partition; ordinary removal only removes it from the sidebar.

## UX Direction

The interface is a quiet, dense desktop tool rather than a marketing page:

- narrow dark sidebar for fast scanning;
- one clear active-site state;
- compact settings surface for adding and ordering sites;
- visible loading, offline, and failed-load states;
- keyboard navigation for repeated switching;
- restrained motion that never delays a site interaction.

## Development Workflow

1. Install dependencies with `pnpm install`.
2. Run the desktop dev loop with `pnpm dev`.
3. Run type checking and build before handoff.
4. Use a real non-secret site URL for manual WebContentsView checks.
5. Record the actual `cc switch` invocation mechanism before implementing any
   adapter beyond protocol handling.

## Acceptance Criteria

- The app opens one desktop window with a site sidebar.
- A site can be added, edited, enabled/disabled, reordered, and removed.
- Switching sites reuses the site's session and does not open Chrome tabs.
- Restarting the app preserves site metadata and site login sessions.
- Remote pages cannot access Node APIs through the shell.
- CC Switch links are not rendered as broken pages and can wake the local
  handler when CC Switch has registered the `ccswitch` protocol.
- A packaged build can check, download, and install a newer GitHub Release.
- Minimizing or closing the window hides the app in the system tray; the tray
  menu can reopen or exit it.
- Type check and production build pass; manual site and protocol checks are
  reported separately.

## Deferred Work

- Split view and background tab throttling.
- Site-specific adapters or DOM automation.
- Unified search/history across remote sites.
- Notifications.
- Installer signing and automatic update distribution.
