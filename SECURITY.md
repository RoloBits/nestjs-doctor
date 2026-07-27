# Security Policy

## Supported versions

Fixes land on the latest published release of `nestjs-doctor`. Older versions
are not patched — upgrade before reporting.

## Reporting a vulnerability

Report privately through
[GitHub Security Advisories](https://github.com/RoloBits/nestjs-doctor/security/advisories/new).
Please do not open a public issue for a vulnerability.

Include the version, what an attacker can do with it, and the smallest
reproduction you can manage. You can expect an initial response within a week.

## Scope

nestjs-doctor is a static analysis tool. It reads source files and never
executes the code it scans.

The one exception is **custom rules**: `customRulesDir` loads `.ts` files from
your project and runs them in-process. Treat a config that points at a custom
rules directory the same way you treat any other code in the repository.

In scope:

- Anything that makes scanning a repository execute code from that repository
  outside of `customRulesDir`
- Path traversal that reads or writes outside the scanned directory and the
  configured output paths
- Secrets leaking into a report, a SARIF file, or a pull request comment

Out of scope:

- A rule that misses a real vulnerability in the scanned code, or reports one
  that is not there — that is a bug, so please open a normal issue
- Vulnerabilities in the code being scanned rather than in nestjs-doctor itself
