# Contributing to SCI Healthcare Frontend

The web app for funders, clinics and attesters. Next.js 16, React 19,
Tailwind 4, TypeScript.

# # Setup

Use Node 22 (`nvm use` reads `.nvmrc`). Its bundled npm 10 is what CI runs;
a lockfile written by npm 11 drops entries npm 10 requires and fails `npm ci`.

```bash
npm install
cp .env.example .env.local   # fill in contract ids and API url
npm run dev
```

You also need the backend running on `http://localhost:8080` and contract ids
from a deployment. See `sci-healthcare-contracts/README.md`.

```bash
npm run typecheck
npm run build
```

`npm run build` is a production build, so it checks the required
`NEXT_PUBLIC_*` values first and stops with an itemised message when one is
missing (see `next.config.ts`, #76). Fill in `.env.local` before building —
`next dev` and Storybook are not affected by that check.

## Architecture

The map lives in [`docs/architecture.md`](docs/architecture.md). It covers the
layers of the app — pages, providers, hooks, the API client, the contract
wrappers, the wallet and the offline shell — and ends with the behaviours that
surprise people reading the code for the first time. Read it before changing
anything that crosses a layer: the SWR cache keys, the write path and the
service worker's rules are all written down there.

Two sentences it makes concrete, and that the rest of this file depends on:
**reads go to the indexer over HTTP, and writes go from the browser straight
to Soroban RPC.** Optional testnet fee sponsorship adds a sign-only backend
round trip before browser submission; see [the sponsor contract](docs/sponsored-fees.md).
The sponsor never receives a wallet key and must not submit transactions.

## Non-negotiables

- **Non-custodial, always.** The app must never hold, request, or transmit a
  secret key or seed phrase. Signing happens in the user's wallet. A PR that
  introduces key handling will be rejected.
- **Nothing identifying leaves the browser.** The patient identifier and HMAC key
  are used locally to derive `beneficiaryRef` and must never be sent to the API,
  logged, or put in a URL. The same holds for analytics: pageviews use
  normalized routes and funnel events carry names only — never addresses,
  references, amounts or voucher ids (see `src/lib/analytics.ts`). Error
  reports go through the `beforeSend` scrubber in
  `src/lib/error-reporting.ts`, which redacts the same material; keep replay
  and tracing off.
- **`NEXT_PUBLIC_*` is inlined at build time.** Setting these only in a host's
  runtime environment produces a build still pointing at localhost. If you add
  one, document it in `.env.example` and the README.
- **i128 amounts are strings or BigInt, never `Number`.** Use the helpers in
  `src/lib/amounts.ts`.
- **Simulate before asking for a signature.** Users should never be prompted to
  approve a transaction already known to fail. `invokeContract` does this; keep
  it that way.
- **Show contract errors in plain language.** Add new codes to
  `src/lib/errors.ts` rather than surfacing raw host errors.

## UI conventions

- Only offer an action the contract will currently accept. `VoucherRow` filters
  actions against voucher state — extend that rather than adding a button that
  fails on click.
- Prefer explaining the mechanism over reassuring the user. "Dispute window
  closes in 3h — settles after that" beats "Processing".

## Commits and PRs

```
feat(web): add provider search to the clinic directory
fix(wallet): restore session after the kit rotates its storage key
```

- `npm run typecheck` and `npm run build` must pass.
- Screenshots for any visible change, light background at minimum.
- Visual snapshots cover the six routes at desktop and 390px widths
  (`npm run test:visual`, mocked API, frozen clock). After an intentional UI
  change, run `npm run test:visual:update` and commit the new snapshots.
- End-to-end tests drive the fund, claim, attest, dispute and refund flows
  (`npm run test:e2e`, mock wallet and RPC, no testnet needed).
- No new dependency without saying in the PR why it is needed.

## How pull requests are merged

A bot merges pull requests automatically (squash) as soon as every CI check on the latest commit has passed, provided the pull request:

- is not a draft and has no `do-not-merge` label,
- links the issue you were assigned on Drips Wave, with a line such as `Closes #123` in the description (Wave points are awarded when that issue is closed as completed, which the bot does on merge),
- has no merge conflicts and is up to date with `main` (the bot comments if it is behind),
- passes the security scan (the `security-scan` status, see below),
- and, if it changes anything under `.github/` (CI workflows and repository automation), has been approved by a maintainer. The bot comments with the files that need approval.

So open your pull request as a draft until it is ready, and keep CI green. To stop an automatic merge, add the `do-not-merge` label or convert the pull request back to a draft.

### Security scan

Every pull request is scanned for malicious changes before it can be merged. The scan runs from `main`, reads your changes as data and never runs them. It reports on the pull request as the `security-scan` status and, if anything needs attention, in a comment listing each finding.

- **block** findings are never merged automatically. Examples are executables and unexpected binaries, hidden or bidirectional Unicode characters (Trojan Source), crypto miners, reverse shells, piping a download into a shell, reading credential files, dependencies from git URLs, tarballs or paths outside the repository, look-alike (typosquatted) package names, packages that do not exist on npm, lockfile entries from another registry or without an integrity hash, crates from outside crates.io, and packages listed as malware in the OSV database.
- **review** findings are common in legitimate work but also how malware gets in. Examples are new dependencies that are recent or rarely used, changed npm scripts, `eval` and spawned processes, encoded or minified code, new network hosts or Stellar addresses, shell scripts, and security-sensitive files. A maintainer reads the change and adds the `security-reviewed` label, after which it merges as usual. A new push removes the label, so the latest commit is always the one reviewed.

If a finding is a false positive, say so on the pull request; please do not try to reword code to get past the scan.

## Wave program

Issues carry `trivial` (100), `medium` (150) or `high` (200) complexity labels.
Read the [Wave rules](https://docs.drips.network/wave/terms-and-rules/); untested
or unreviewed LLM output is explicitly disallowed.
