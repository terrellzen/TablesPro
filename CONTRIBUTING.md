# Contributing

Use strict TypeScript, keep package boundaries clear, and put business rules in domain services rather than route handlers.

Before opening a change, run:

```sh
npm run typecheck
npm test
npm run license:check
```

Do not add dependencies with licenses outside the allowlist in `THIRD_PARTY_LICENSES.md`.
