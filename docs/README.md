# Docs

Project documentation lives in this folder. Start with the **Developer Guide** for a complete overview.

## Developer Guide

- **[DEV_GUIDE.md](./DEV_GUIDE.md)** — Main entry point: project overview, architecture, quick start, and documentation map

## Release Notes

- [v0.1.5 Release Notes Draft](./release-notes/v0.1.5.md) — Draft copy for the next GitHub Release notes

### Architecture

- [Request Flow & Streaming](./architecture/request-flow-and-streaming.md) — End-to-end chat streaming, SSE protocol, V2 frame types
- [IPC Boundary](./architecture/ipc-boundary.md) — Electron IPC patterns, bridge layers, channel registry
- [System Prompt V2](./architecture/system-prompt-v2.md) — 3-layer prompt override architecture
- [Memory System](./architecture/memory-system.md) — Embedding resolution, Qdrant, session vs long-term memory
- [Storage Model](./architecture/storage-model.md) — localStorage persistence, schema versioning, tree structure

### Data Models

- [Chat Session & Messages](./data-models/chat-session-and-messages.md) — Session shape, message shape, attachments, trace frames
- [Model & Toolkit Catalog](./data-models/model-and-toolkit-catalog.md) — Model catalog, toolkit V2, provider structure
- [Character Spec](./data-models/character-spec.md) — Character identity, avatar, schedule, memory profiles
- [Tree & Explorer](./data-models/tree-and-explorer.md) — Folder/chat nodes, tree store, explorer projection

### API Reference

- [Flask Endpoints](./api-reference/flask-endpoints.md) — All HTTP routes on the Python sidecar
- [IPC Channels](./api-reference/ipc-channels.md) — All Electron IPC channels and patterns
- [Window APIs](./api-reference/window-apis.md) — All `window.*API` bridges exposed to React
- [Frontend API Facades](./api-reference/frontend-api-facades.md) — `api.unchain.js`, `api.ollama.js`, `api.system.js`

### Features

- [Character System](./features/character-system.md) — Personas, schedules, avatars, seeding, import/export
- [Toolkit & Tool Catalog](./features/toolkit-and-tool-catalog.md) — Discovery, TOML format, tool metadata, auto-approval
- [Workspace System](./features/workspace-system.md) — Named workspaces, per-chat selection, path resolution
- [Agent Orchestration](./features/agent-orchestration.md) — Sub-agent events, delegation, prompt sections

### Conventions

- [Project Conventions](./conventions/project-conventions.md) — Naming, styling, file org, component patterns, pitfalls
- [Build & Testing](./conventions/build-and-testing.md) — Build pipeline, test commands, CI setup

## Legal

- [Contributor License Agreement](./CLA.md)
- [macOS Release Signing](./MACOS_RELEASE.md)
- [Trademark Policy](./TRADEMARK_POLICY.md)
