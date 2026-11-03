<div align="center">

<img src="./assets/logo.png" width="96" height="96" alt="Imprint Console" />

# Imprint Console

**Operations console for [imprint](https://github.com/SteamedBread2333/imprint)**

[![release](https://img.shields.io/github/v/release/SteamedBread2333/imprint-console?include_prereleases&style=flat-square)](https://github.com/SteamedBread2333/imprint-console/releases)
![MIT](https://img.shields.io/badge/license-MIT-c4a574?style=flat-square)

Manage Host / Shelves, a built-in read-only Audit desk, and global Embed; auto-install imprint, Python, and the embed sidecar.

**Languages:** [English](./README.md) · [中文](./README.zh-CN.md)

</div>

## About imprint

[imprint](https://github.com/SteamedBread2333/imprint) is a **project-scoped memory layer** for AI coding tools: durable rules live in a local vault, optional **Shelves** index project docs, and an optional **embed sidecar** adds semantic dedup when writing rules. Agents and editors use the **CLI** or **MCP** to recall and update memory; **Imprint Console** (this repo) is the desktop app to run Host/Shelves, inspect graphs in Audit, and manage global embed/runtime—not a replacement for the CLI workflow.

## Getting started

You need Rust, Node 20+, **git** (to clone the sidecar), and network access (first-time runtime setup).

```bash
git clone https://github.com/SteamedBread2333/imprint-client.git
cd imprint-client
npm install --legacy-peer-deps
npm run tauri dev
```

On first launch, use **Prepare runtime** in the dialog, or install/update under **Settings → Runtime**.  
Embed is configured once globally in `~/.imprint/embed.yaml` (project `imprint.yaml` must **not** include `plugins.embed`).  
Optionally pick a project root that contains `imprint.yaml` to manage Host / Shelves and open Audit (rules, docs, unified graph). You can start/stop Embed without selecting a project.

Audit talks to the local Host for the current project via typed Tauri commands—no Node/Express server, no `imprint-desk-plugin`, and no port 4173. The desk is read-only; rule writes still go through the imprint CLI or MCP.

See [docs/runtime-releases.md](docs/runtime-releases.md).

## Download

On [Releases](https://github.com/SteamedBread2333/imprint-client/releases), pick **one** artifact for your system (version numbers such as `0.1.0` change over time).

| File | Platform |
| --- | --- |
| `*_aarch64.dmg` | **macOS · Apple Silicon** (M1 / M2 / M3 / M4) |
| `*_x64.dmg` | **macOS · Intel** |
| `*_aarch64.app.tar.gz` | macOS Apple Silicon — unpack to get `.app` (no DMG installer) |
| `*_x64.app.tar.gz` | macOS Intel — same |
| `*_amd64.deb` | **Debian / Ubuntu** and similar (`sudo dpkg -i …deb`) |
| `*-1.x86_64.rpm` | **Fedora / RHEL** and other RPM distros |
| `*_amd64.AppImage` | Generic **Linux x86_64** — `chmod +x` and run |
| `*.msi` / `*-setup.exe` | **Windows 10/11** x64 (exact names vary by release) |

Notes:

- **Release artifacts are the desktop app only.** The **imprint CLI** is installed via **`go install`** to a global path (e.g. `~/go/bin/imprint`). **Python and the embed sidecar** live under app data. Details: [runtime-releases](docs/runtime-releases.md) (Go toolchain and network required).
- **Linux builds target x86_64 (amd64)**; there is no arm64 Linux package.

## License

MIT
