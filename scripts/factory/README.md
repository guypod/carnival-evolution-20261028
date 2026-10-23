# Factory contract check

`tessl.json` decides which GitHub events start Tessl's factory. This folder
pins that file to an approved contract and tests the routes offline.

- `contract.mjs`: the exact actions (skill `tessl-labs/factory@0.6.0`, agent
  `claude-code`, model `claude-opus-5-5`, environment, timeouts) and the eleven
  triggers, with their guards, concurrency keys (the existing 90s shepherd
  debounce, and replies sharing the implement lock) and actions.
- `check-contract.mjs`: fails when `tessl.json` differs from the contract.
- `matcher.mjs`: an offline model of how a trigger's `when` block matches a
  payload. It supports only the predicates this manifest uses (equality,
  `matches`, `exists`, `in`, `any.equals` over `*`, `isPullRequest`) and throws
  on anything else. It is not the production scheduler and not a security
  boundary; online validation is still required.
- `factory.test.mjs`: positive fixtures for all eleven routes, negative
  fixtures, and unsafe mutants.

`npm run check` runs `npm run factory:check` after its other steps.

## Demo

```sh
git show 56c1e19:tessl.json > /tmp/original-tessl.json
node scripts/factory/check-contract.mjs /tmp/original-tessl.json  # fails 11 checks: no repository guard, no closed state
node scripts/factory/check-contract.mjs                           # factory contract: tessl.json holds
node --test scripts/factory/factory.test.mjs                      # mutants fail; cancellation and dependency routes still match
```

Changing the factory on purpose means changing `contract.mjs` in the same pull
request.
