---
"nestjs-doctor": patch
---

Reviewing a finding in the menu now shows the rule's own guidance underneath it: what the rule looks for, then the bad and good code samples the HTML report already carried. Bad and good are marked by a word, a glyph and a per-line sigil, so the pair reads the same with colour turned off.

The samples are now tested. Each rule's bad sample has to fire that rule, and its good sample has to stay silent in the same file, which caught two that were wrong: `security/no-dangerous-redirects` never fired because the sample had no enclosing controller, and its good sample was worse than useless, showing an allowlist check the rule does not accept and would still report.
