# Contributing

Thanks for helping improve Maintainer Firewall. The project is intentionally maintainer-first: changes should reduce review load without making contributors feel punished by automation.

## Development

```bash
npm install
npm run ci
npm run demo
```

Commit source changes together with the bundled `dist/` output.
Run `npm run bundle` when runtime source changes need updated bundled output.
Use `npm run release:check` before tagging a release.
See [docs/MAINTENANCE.md](docs/MAINTENANCE.md) for review, release, dependency, and diagnostic maintenance gates.

## Pull Request Expectations

- Keep changes narrowly scoped.
- Add or update tests for rule, scoring, comment, or configuration behavior.
- Avoid rules that try to detect whether text was AI-generated.
- Do not log or echo matched secret values.
- Prefer advisory findings over hard failures unless the risk is clear.
- Update public docs, examples, action metadata, and tests together when an input, output, finding ID, or report surface changes.

## Product Principles

- Low-noise defaults beat aggressive automation.
- Maintainers should see the next best action, not a wall of findings.
- Contributors should receive specific, fixable requests.
- Project-specific guidance should override generic advice.
- Security-sensitive reports should route to humans quickly and carefully.
