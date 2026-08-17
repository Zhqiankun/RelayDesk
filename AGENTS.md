# RelayDesk Project Instructions

## Project Purpose

RelayDesk is a Windows desktop workspace for keeping multiple web-based relay
stations in one Electron window. It is a desktop shell, not a proxy service,
credential manager, or backend aggregator.

## Technology Baseline

- Electron with `WebContentsView` for remote site content.
- Vite-powered Vue 3 renderer using Composition API and `<script setup>`.
- TypeScript with strict checking enabled.
- pnpm is the preferred package manager once the scaffold is initialized.
- No application backend is required for the first release.

## Module Boundaries

- `electron/main/`: Electron main-process orchestration, window lifecycle, site
  sessions, navigation policy, downloads, and native protocol handoff.
- `electron/preload/`: the minimal typed bridge for renderer-owned UI operations.
  Never expose arbitrary command execution or filesystem access.
- `src/renderer/`: Vue UI only: site navigation, configuration forms, empty,
  loading, and error states.
- `src/shared/`: stable, dependency-light contracts shared by main, preload,
  and renderer. It must not import Electron or Vue.
- `docs/`: architecture, development workflow, and acceptance notes.

## Working Rules

- Keep remote webpages isolated from Node APIs. Use `nodeIntegration: false`,
  `contextIsolation: true`, and `sandbox: true` wherever supported.
- Persist only site metadata and Electron session partitions. Do not persist
  passwords, API keys, cookies, or captured page content in application files.
- Site configuration is data, not a collection of site-specific components.
- Keep native operations behind typed IPC handlers. Validate message shape and
  source before changing desktop state.
- `cc-switch` support must preserve its existing invocation mechanism. Custom
  URL schemes are handled by the main process; localhost requests remain page
  network traffic unless a concrete site requires a bridge.
- Use ASCII by default in source and configuration files. User-facing Chinese
  text is allowed in the UI and documentation.
- Prefer small, explicit modules over generic helpers or a universal service
  abstraction. Add an abstraction only when it protects a stable contract.
- Do not add analytics, remote telemetry, or a cloud account for the first
  release.

## Validation

Before considering a change complete, run the available type check, lint, build,
and focused tests. Manual acceptance must cover:

1. Adding and switching between at least three sites without opening Chrome.
2. A site remaining logged in after switching and restarting RelayDesk.
3. Popups, downloads, and external links following the documented policy.
4. The real `cc switch` trigger working without being swallowed by the shell.
5. A failed site load showing actionable UI instead of a blank view.

Document any environment-limited check as unverified rather than inferring
success from a build-only result.
