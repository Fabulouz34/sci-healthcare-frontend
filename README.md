<p align="center">
  <img src="docs/banner.png" alt="SCI Healthcare" width="640" />
</p>

<p align="center">
  <a href="https://github.com/Godgift-care/sci-healthcare-frontend/actions/workflows/ci.yml">
    <img src="https://github.com/Godgift-care/sci-healthcare-frontend/actions/workflows/ci.yml/badge.svg" alt="CI" />
  </a>
  <img src="https://img.shields.io/badge/next.js-16.3-black" alt="next 16" />
  <img src="https://img.shields.io/badge/react-19.2-blue" alt="react 19" />
  <img src="https://img.shields.io/badge/license-Apache--2.0-green" alt="Apache 2.0" />
</p>

# SCI Healthcare — Web App | [Documentation](https://godgift-care.github.io/sci-healthcare-contracts/)

> **Live:** [App](https://sci-healthcare.vercel.app) · [API](https://sci-healthcare-api.onrender.com/stats) · [Docs](https://godgift-care.github.io/sci-healthcare-contracts/) · [Contracts on testnet](https://stellar.expert/explorer/testnet/contract/CBPUQN6CNJCNGPKNEXB7UM4T7RINKQB7HQI5CXEOSQ5EFRHE4G4VKPSQ)
>
> The API runs on Render's free tier and sleeps after ~15 minutes idle; the first
> request may take 30–60 seconds to wake it.

The interface for the [SCI Healthcare care-voucher protocol](https://github.com/Godgift-care/sci-healthcare-contracts) on Stellar.

Someone funds a voucher for a specific clinic and a specific service. The money sits in escrow and is released only once an independent attester confirms the care was delivered. If it never happens, the funder gets it back. The funder need not be the patient — a relative sending from abroad uses the same flow, which is the point: a remittance that can only be spent on the care it was sent for.

<p align="center">
  <a href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FGodgift-care%2Fsci-healthcare-frontend&env=NEXT_PUBLIC_API_URL&envDescription=URL%20of%20the%20deployed%20indexer%20API&envLink=https%3A%2F%2Fgithub.com%2FGodgift-care%2Fsci-healthcare-backend">
    <img src="https://vercel.com/button" alt="Deploy with Vercel" />
  </a>
</p>

Contract ids are already in `vercel.json`. Vercel will prompt for one variable,
`NEXT_PUBLIC_API_URL` — the URL of your deployed backend. See [DEPLOY.md](DEPLOY.md).

## Maintainers

<table align="center">
  <tr>
    <td align="center">
      <img src="https://github.com/adelekevat.png" width="140" alt="Maintainer" />
      <br /><br />
      <strong>Adeleke | Frontend &amp; Protocol</strong>
      <br /><br />
      <a href="https://github.com/adelekevat">adelekevat</a>
    </td>
  </tr>
</table>

## The four screens

| Route | Who it is for | What it does |
| --- | --- | --- |
| `/` | Anyone | Verified clinic directory with live service pricing, plus a map view of clinics with published locations |
| `/clinics/[address]` | Funders | Pick a service and fund a voucher |
| `/my` | Funders and patients | Vouchers you funded; dispute, refund, settle; care history lookup |
| `/clinic` | Clinics | Register, list services, mark patients seen |
| `/attest` | Attesters | Review claimed vouchers and confirm delivery |
| `/vouchers/[id]` | Anyone | One voucher's on-chain history, receipt and available actions; shareable by link |

## Two properties worth stating up front

**Non-custodial.** The app never holds, requests, or transmits a wallet secret key. Transactions are built and simulated in the browser, signed in the user's wallet, and submitted straight to Soroban RPC. Optional testnet fee sponsorship sends the signed transaction to a sponsor for a fee-bump signature before browser submission; see [sponsored fees](docs/sponsored-fees.md).

**Nothing identifying leaves the browser.** The patient reference and its secret key are used locally, via Web Crypto HMAC-SHA256, to derive an opaque 32-byte value. The identifier and key are never sent to the API, never logged, and never written to the ledger.

## How a write works

```
  build tx ──> simulate ──> assemble (footprint, resource fees, auth)
                  │                        │
                  │ fails                  ▼
                  ▼                   sign in wallet
          readable error                   │
          (never prompts                   ▼
           the wallet)              submit to RPC ──> poll to finality
```

Simulation happens **before** signing, so a user is never asked to approve a transaction already known to fail. Contract error codes are mapped to plain language in `src/lib/errors.ts` — a rejected settlement says "the dispute window is still open", not `Error(Contract, #13)`.

## Quick start

You need the backend running and a deployed set of contracts.

```bash
git clone https://github.com/Godgift-care/sci-healthcare-frontend
cd sci-healthcare-frontend
npm install
cp .env.example .env.local     # fill in the ids below
npm run dev                    # http://localhost:3000
```

Install [Freighter](https://freighter.app) (or any SEP-43 wallet), switch it to **Testnet**, and fund the account at [friendbot](https://friendbot.stellar.org). To hold test USDC you also need a trustline to the issuer (`USDC_ISSUER` in the contracts repo's `deployments/testnet.env`). Then use **Get test USDC** on *My vouchers*: it draws 50 USDC a day from the testnet faucet contract.

## Environment

Every one of these is inlined into the client bundle at **build** time.

| Variable | Example |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8080` |
| `NEXT_PUBLIC_SPONSORED_FEES` | `(optional) true enables opt-in testnet fee sponsorship; unset disables it. Requires the separate sponsor backend described in docs/sponsored-fees.md.` |
| `NEXT_PUBLIC_STELLAR_NETWORK` | `testnet` |
| `NEXT_PUBLIC_SOROBAN_RPC_URL` | `https://soroban-testnet.stellar.org` |
| `NEXT_PUBLIC_NETWORK_PASSPHRASE` | `Test SDF Network ; September 2015` |
| `NEXT_PUBLIC_REGISTRY_CONTRACT_ID` | `CAMU635NRFEHATJ6MTY5SI43IAZ43KHPFXAQDQAST2AHKCHLSGWHVE4V` |
| `NEXT_PUBLIC_VOUCHER_CONTRACT_ID` | `CBPUQN6CNJCNGPKNEXB7UM4T7RINKQB7HQI5CXEOSQ5EFRHE4G4VKPSQ` |
| `NEXT_PUBLIC_RECEIPT_CONTRACT_ID` | `CBCJRI2BCZBMZNX77WWDC2NGSV4ZNAN5Q23XHYNBH6UTOQMPJHZGX5C7` |
| `NEXT_PUBLIC_USDC_CONTRACT_ID` | `CCRLJ7FEIKTR3GBT3VQQPSIJGRBO2WPNMVFKJDP6AYGJQWECOR4QVE5M` |
| `NEXT_PUBLIC_FAUCET_CONTRACT_ID` | `CCB25WG7DQ2CSNXPTOHZO2PDZ324FQPZLH3LSNCCLWYM3FEH52GEXC47` (testnet only; leave unset in production) |
| `NEXT_PUBLIC_USDC_ISSUER` | `GCKX5KAFVF7GLFZ3JWQGJ4F62RYYZU67PI3TACBGKVPJ73JELMI3L4KR` |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | `(optional) analytics domain, e.g. `app.example.com`; unset disables analytics entirely` |
| `NEXT_PUBLIC_SENTRY_DSN` | `(optional) Sentry DSN for error reporting; unset disables it entirely` |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | `(optional) Reown project id for mobile wallets; unset offers extension and passkey wallets only` |

> If the deployed app still calls `localhost`, these were set in the host's **runtime** environment but not its **build** environment. Next inlines `NEXT_PUBLIC_*` at build time; setting them afterwards changes nothing. This is the single most common deployment failure for this shape of app.

`NEXT_PUBLIC_STELLAR_NETWORK` also drives the header badge and every testnet-only feature through a single `isTestnet` helper (`src/lib/config.ts`). Setting it to `public` builds for mainnet: the badge reads **Mainnet**, and the faucet, its notices and the footer disclaimer are hidden.

## Analytics

Usage analytics is cookieless [Plausible](https://plausible.io), behind `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` — unset means no script loads and nothing is sent. Pageviews use normalized routes (`/clinics/[address]`, never the address), and funnel events (`voucher_funded`, `voucher_claimed`, `care_confirmed`, `dispute_opened`, `voucher_settled`, `voucher_refunded`) carry names only: no addresses, patient references, amounts or voucher ids ever leave the browser.

## Error reporting

Uncaught errors are reported to [Sentry](https://sentry.io), behind `NEXT_PUBLIC_SENTRY_DSN` — unset means the SDK never initialises. Every report passes through a `beforeSend` scrubber (`src/lib/error-reporting.ts`) that normalizes dynamic routes and redacts 64-hex digests, Stellar addresses and sensitive query parameters, so patient references, secret keys and beneficiary hashes never leave the browser. Tracing and session replay stay off.

## Security headers

Every route is served with a Content-Security-Policy built in `next.config.ts`
from the same build-time variables the client bundle reads, so the allow-list
cannot drift from the origins the app actually calls: the indexer API, Soroban
RPC, Horizon, the wallet hosts the SEP-43 kit talks to, OpenStreetMap tiles and
the optional Plausible/Sentry origins. `frame-ancestors 'none'` (with
`X-Frame-Options: DENY`), `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy`, `X-Content-Type-Options: nosniff` and
`Cross-Origin-Opener-Policy: same-origin-allow-popups` follow it.

The policy is sent as `Content-Security-Policy-Report-Only` by default: run the
app with a real wallet, watch the console for violations, then build with
`CSP_ENFORCE=1` to enforce it. Headers are baked in at build time, so redeploy
after changing the variable. Covered by `tests/e2e/security-headers.spec.ts`.

## Low-bandwidth mode

Clinic connections are often slow and metered, so the header carries a **Low
data** switch, remembered per browser in `localStorage`. With it on:

- live updates fall back from a held-open SSE stream to a 60s poll;
- SWR stops revalidating on focus and reconnect;
- the clinic map is not offered, so neither the Leaflet chunk nor any
  OpenStreetMap tile is requested;
- cookieless analytics is off: no script is loaded and no pageview is sent.

Writes are untouched — contract calls are built, simulated, signed and
submitted exactly as before — and error reporting stays on, because a failed
transaction on a bad link is exactly when a report is worth its bytes.
Measured on the home page with the map open: **748 KB → 438 KB** at 1280px and
**562 KB → 409 KB** at 390px (`tests/e2e/low-bandwidth-mode.spec.ts` asserts
the byte count and the traffic).

## Installable app and offline shell

The app ships a web app manifest (`src/app/manifest.ts`) and icons, so a phone
can install it, and `public/sw.js` caches the shell — the `/` document, the
manifest, the icons and the content-hashed build output — so it opens on a
connection that is down and says plainly that it cannot reach the indexer.

Nothing else is cached. The indexer API, Soroban RPC, Horizon, map tiles and
analytics are cross-origin and pass straight through, and so do Next's
same-origin RSC payloads, because those carry page content. A cached API answer
would be a privacy leak on a shared clinic phone, and a wrong answer too: a
voucher's state comes from the chain, not from yesterday's response.

Icons are generated rather than hand-drawn (`npm run icons`,
`scripts/generate-icons.mjs`) and checked in so a deployment needs no asset
step. `tests/e2e/offline-shell.spec.ts` covers the manifest, the icons and the
offline reload; the other suites block service workers
(`playwright.config.ts`) so their network stays deterministic.

## Deploying

Suited to a platform built for Next.js, such as Vercel.

- Framework preset: Next.js
- Build: `npm run build`
- Add every `NEXT_PUBLIC_*` variable above to the project's environment **before** the first build
- Point `NEXT_PUBLIC_API_URL` at the deployed indexer, and add that origin to the backend's `CORS_ORIGIN`

## Related repositories

| Repo | Purpose |
| --- | --- |
| [sci-healthcare-contracts](https://github.com/Godgift-care/sci-healthcare-contracts) | Soroban contracts |
| [sci-healthcare-backend](https://github.com/Godgift-care/sci-healthcare-backend) | Event indexer and read API |
| [sci-healthcare-frontend](https://github.com/Godgift-care/sci-healthcare-frontend) | Web app (this repo) |

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md). New to the code? Start with the
[architecture map](docs/architecture.md) — it shows how the pages, the hooks,
the API client, the contracts, the wallet and the offline shell fit together.
Security reports go through [SECURITY.md](SECURITY.md).

## Contributors

<a href="https://github.com/Godgift-care/sci-healthcare-frontend/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=Godgift-care/sci-healthcare-frontend" />
</a>

## License

Apache-2.0. See [LICENSE](LICENSE).
