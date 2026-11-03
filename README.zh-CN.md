<div align="center">

<img src="./assets/logo.png" width="96" height="96" alt="Imprint Console" />

# Imprint Console

**[imprint](https://github.com/SteamedBread2333/imprint) 后台运维控制台**

[![release](https://img.shields.io/github/v/release/SteamedBread2333/imprint-console?include_prereleases&style=flat-square)](https://github.com/SteamedBread2333/imprint-console/releases)
![MIT](https://img.shields.io/badge/license-MIT-c4a574?style=flat-square)

管理 Host / Shelves、内置只读审计工作台与全局 Embed；可自动安装 imprint / Python / sidecar。

**语言：** [English](./README.md) · [中文](./README.zh-CN.md)

</div>

## 关于 imprint

[imprint](https://github.com/SteamedBread2333/imprint) 是面向 AI 编程工具的 **项目级记忆层**：规则持久化在本地 vault，可选 **Shelves** 索引仓库文档，可选 **embed sidecar** 在写入时做语义去重。Agent 与编辑器通过 **CLI** 或 **MCP** 召回与维护记忆；**Imprint Console**（本仓库）是桌面运维端，用于启停 Host/Shelves、在 Audit 中查看关系图、管理全局 embed 与运行环境，**不替代** CLI/MCP 的写入路径。

## 开始

需要 Rust、Node 20+、**git**（clone sidecar）、联网（首次准备运行环境）。

```bash
git clone https://github.com/SteamedBread2333/imprint-client.git
cd imprint-client
npm install --legacy-peer-deps
npm run tauri dev
```

首次启动在弹窗中 **准备运行环境**；也可在 **设置 → 运行环境** 中安装或更新。  
Embed 配置全局一份：`~/.imprint/embed.yaml`（项目 `imprint.yaml` **不含** `plugins.embed`）。  
可选：选择含 `imprint.yaml` 的项目根以管理 Host / Shelves，并在 Audit 中查看规则、文档与统一关系图；不选项目也可启停 Embed。

Audit 通过类型化 Tauri 命令访问当前项目的本机 Host，不启动 Node/Express 服务，也不依赖 `imprint-desk-plugin` 或端口 4173。工作台只读；规则写入仍由 imprint CLI/MCP 完成。

详见 [docs/runtime-releases.md](docs/runtime-releases.md)。

## 下载

在 [Releases](https://github.com/SteamedBread2333/imprint-client/releases) 按系统选 **一个** 即可（文件名里的 `0.1.0` 随版本变化）。

| 文件 | 适用 |
| --- | --- |
| `*_aarch64.dmg` | **macOS · Apple 芯片**（M1 / M2 / M3 / M4） |
| `*_x64.dmg` | **macOS · Intel** |
| `*_aarch64.app.tar.gz` | macOS Apple 芯片，解压得到 `.app`（免 DMG 安装器） |
| `*_x64.app.tar.gz` | macOS Intel，同上 |
| `*_amd64.deb` | **Debian / Ubuntu** 等（`sudo dpkg -i …deb`） |
| `*-1.x86_64.rpm` | **Fedora / RHEL** 等 RPM 系 |
| `*_amd64.AppImage` | 通用 **Linux x86_64**，chmod +x 后直接运行 |
| `*.msi` / `*-setup.exe` | **Windows 10/11** x64（以 Release 实际文件名为准） |

说明：

- **Release 仅含桌面控制台**。**imprint CLI** 使用 **go install 全局路径**（如 `~/go/bin/imprint`）；**Python 与 embed sidecar** 在应用数据目录。详见 [runtime-releases](docs/runtime-releases.md)（需 Go 与网络）。
- **Linux** 构建目标为 **x86_64（amd64）**，不提供 arm64 Linux 包。

## License

MIT
