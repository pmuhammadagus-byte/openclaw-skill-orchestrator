# Contributing to Skill Orchestrator

Thanks for helping make skill management safer and smarter.

## Development
- Requires Node.js ≥ 18 and the OpenClaw plugin SDK.
- Install deps: `npm install`
- Build: `node ./node_modules/typescript/bin/tsc`
- Inspect before publishing: `clawhub package inspect .`

## Rules
1. **No hardcoded secrets.** Validation intentionally scans for secret patterns — do not add real tokens, keys, or passwords to this repo.
2. **Keep the 5 core tools stable.** New capabilities should be additive.
3. **Back up before fixing.** `skill_fix` always writes a `.backup.<ts>` copy before mutating a file; keep that guarantee.
4. **TypeScript strict.** `tsc` must pass with zero errors before a PR is merged.

## Reporting issues
Open an issue with: OpenClaw version, plugin version, the skill directory layout, and the exact tool + parameters you ran.
