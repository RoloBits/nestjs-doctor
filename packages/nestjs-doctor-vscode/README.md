<p align="center">
  <img src="https://nestjs.doctor/logo.png" width="120" alt="nestjs-doctor logo" />
</p>

<p align="center">
  <h1 align="center">NestJS Doctor</h1>
</p>

<p align="center">
  <b>Static analysis for NestJS — inline diagnostics and health score, right in your editor.</b>
</p>

<p align="center">
  <a href="https://npmjs.com/package/nestjs-doctor"><img src="https://img.shields.io/npm/v/nestjs-doctor?style=flat&colorA=18181b&colorB=18181b" alt="npm version"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=rolobits.nestjs-doctor-vscode"><img src="https://img.shields.io/visual-studio-marketplace/v/rolobits.nestjs-doctor-vscode?style=flat&colorA=18181b&colorB=18181b&label=vscode" alt="vscode version"></a>
  <a href="https://github.com/RoloBits/nestjs-doctor/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/nestjs-doctor?style=flat&colorA=18181b&colorB=18181b" alt="license"></a>
</p>

---

## Features

- **Inline diagnostics** — squiggly underlines on the exact line with hover details
- **Problems panel** — all diagnostics surfaced in VS Code's built-in Problems view
- **Status bar** — shows your project's health score at a glance
- **Scan on save** — automatically re-scans when you save a file (configurable debounce)
- **Scan on open** — scans the workspace when VS Code opens
- **Manual scan** — trigger a full project scan from the command palette
- **40 built-in rules** — same rules as the CLI, covering security, performance, correctness, and architecture

---

## Requirements

Install `nestjs-doctor` as a dev dependency in your workspace. The extension's LSP server loads it from your project's `node_modules`.

```bash
npm install -D nestjs-doctor
```

The extension activates automatically when it detects `@nestjs/core` in your `node_modules` or when you open a TypeScript file.

---

## Configuration

### Extension Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `nestjsDoctor.enable` | `boolean` | `true` | Enable NestJS Doctor analysis |
| `nestjsDoctor.scanOnSave` | `boolean` | `true` | Re-scan when a file is saved |
| `nestjsDoctor.scanOnOpen` | `boolean` | `true` | Scan when the workspace opens |
| `nestjsDoctor.debounceMs` | `number` | `2000` | Debounce delay (ms) before re-scanning after save |

### Project Configuration

The extension automatically reads project-level configuration from these files (checked in order):

1. `nestjs-doctor.config.json`
2. `.nestjs-doctor.json`
3. `"nestjs-doctor"` key in `package.json`

This is the same configuration the CLI uses — rule overrides, category toggles, ignore patterns, and exclude globs all work identically in both.

```json
{
  "rules": {
    "no-missing-injectable": true,
    "no-duplicate-providers": { "enabled": true, "severity": "error" }
  },
  "categories": {
    "security": true,
    "performance": false
  },
  "ignore": {
    "files": ["src/legacy/**"],
    "rules": ["no-default-generic"]
  },
  "exclude": ["**/generated/**"],
  "customRulesDir": "./rules"
}
```

See the [configuration reference](https://nestjs.doctor/docs/configuration) for all available options.

---

## Commands

| Command | Description |
|---------|-------------|
| `NestJS Doctor: Scan Project` | Manually trigger a full project scan |

Open the command palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and search for "NestJS Doctor".

---

## Troubleshooting

**Extension not activating?**
Make sure `@nestjs/core` is installed in your workspace's `node_modules`. The extension only activates for NestJS projects.

**No diagnostics showing?**
Verify `nestjs-doctor` is installed as a dev dependency (`npm install -D nestjs-doctor`). The LSP server requires it to be present in `node_modules`.

**Diagnostics are stale?**
Try running `NestJS Doctor: Scan Project` from the command palette. You can also adjust `nestjsDoctor.debounceMs` if scans aren't triggering fast enough after saves.

---

## Links

- [Documentation](https://nestjs.doctor/docs)
- [GitHub](https://github.com/RoloBits/nestjs-doctor)
- [CLI on npm](https://www.npmjs.com/package/nestjs-doctor)
