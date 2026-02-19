# nestjs-doctor

## 0.3.0

### Minor Changes

- 3a21971: Add `/nestjs-doctor` Claude Code skill. Run `npx nestjs-doctor --init` to set it up, then use `/nestjs-doctor` in Claude Code to scan and fix NestJS health issues interactively.

## 0.2.0

### Minor Changes

- ce6c95e: Add `--min-score` CLI flag for CI-friendly score threshold enforcement. Exits with code 1 if the health score is below the specified value (0-100). Also configurable via `minScore` in config file. Exit code 2 for invalid input.

## 0.1.5

### Patch Changes

- Fix apex domain by updating CNAME to nestjs.doctor for proper GitHub Pages SSL certificate provisioning

## 0.1.4

### Patch Changes

- Fix custom domain by using www.nestjs.doctor in CNAME for proper GitHub Pages redirect

## 0.1.3

### Patch Changes

- Fix nestjs.doctor website blank page by removing basePath, fixing favicon path, and adding CNAME file for custom domain

## 0.1.2

### Patch Changes

- a150d79: Improve performance with optimized scanner, better rule runner error handling, API validation, and typed error results

## 0.1.1

### Patch Changes

- 109f534: Fix CLI bin shebang missing — upgrade tsdown to v0.20 which properly supports the banner config, and update package.json entry points to match new .mjs output extensions
