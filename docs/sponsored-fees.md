# Sponsored first-voucher fees (testnet)

Issue #164 adds the client half of fee sponsorship. The sponsor service is a
separate backend deliverable. Keep `NEXT_PUBLIC_SPONSORED_FEES` unset until that
service is deployed and its limits have been verified. No sponsor keys belong
in this app, its build variables, or browser storage.

## Flow and limits

1. An existing testnet account with enough USDC chooses **Request sponsored fees**
   for one voucher, at most 100 USDC. The feature requires both `testnet` and the
   standard testnet passphrase. Other networks, swaps and baskets are excluded.
2. The browser builds, simulates and assembles the same `create_voucher` call as
   ordinary funding, including Soroban resource fees. An estimate over the total
   1 XLM sponsorship cap is rejected before wallet signing.
3. The wallet signs the inner transaction. The browser sends that envelope to
   the sponsor. The raw patient identifier and HMAC secret never leave the
   browser; the transaction contains the opaque beneficiary reference that will
   also appear on chain. Do not log request or response bodies.
4. The service returns a signed fee bump **without submitting it**. The browser
   checks that its inner envelope exactly matches the wallet-signed envelope,
   its fee payer differs from the funder, its total fee fits the cap and its
   fee-source signature verifies. It submits that outer envelope to Soroban RPC
   and polls the outer transaction hash for the voucher result.
5. Rejection, rate limiting, timeout and invalid responses stop the flow. There
   is no automatic retry or fallback to user-paid fees. The user may explicitly
   uncheck sponsorship and confirm a new ordinary transaction. After an RPC
   submission timeout, check the displayed transaction hash before retrying.

These client caps are UX guardrails, not abuse protection. First-voucher
eligibility is decided by the sponsor against authoritative chain state, never
by local storage or an untrusted browser claim. Fee bumps do not create an
account, pay trustline reserves, or buy the voucher's USDC.

## Proposed backend contract

`POST {NEXT_PUBLIC_API_URL}/sponsorship/fee-bump`

```json
{ "network": "testnet", "transaction": "<wallet-signed inner envelope XDR>" }
```

Success, HTTP 200:

```json
{ "transaction": "<sponsor-signed fee-bump envelope XDR>" }
```

HTTP 403 means ineligible; HTTP 429 means quota/rate limit reached. Other
failures are shown as unavailable/declined without displaying server bodies.
The browser uses a 15-second timeout, omits cookies, refuses redirects and does
not cache responses. The existing API origin is already allowed by CSP. The
backend must allow the frontend origin and JSON POST in its CORS policy.

The backend must independently:

- Validate testnet signatures, source authorization, sequence and short expiry;
  allow exactly one configured voucher-contract `create_voucher` invocation.
  Validate funder, token, amount, invocation arguments and authorization tree.
- Re-simulate; enforce total fee including resource/rent charges, the 100 USDC
  amount cap, first-voucher eligibility, per-account/IP rate limits and a global
  budget. Never trust client flags, estimates or claimed account history.
- Atomically reserve first-voucher eligibility/budget with concurrent requests
  and delayed indexer updates in mind. Deduplicate identical inner envelopes;
  release expired reservations safely and reconcile confirmations. Multiple
  different signed envelopes must not bypass the quota.
- Wrap the exact signed envelope, sign using a server-held sponsor key and
  return it without submitting. The client relies on this sign-only contract
  to distinguish sponsor outages from ambiguous RPC submission outcomes.
- Bound payload sizes, redact transaction bodies from logs/error reporting and
  keep the sponsor balance and key management outside the frontend.

## Verification and rollout

Unit tests exercise real SDK envelopes and signatures with ephemeral test keys,
plus the invocation pipeline with RPC doubles. E2E tests exercise the opt-in UI
at desktop and 390px. Mocks do not establish live testnet acceptance.

Before enabling the flag in deployment, use the deployed sponsor with a testnet
account that has its reserve and USDC but no spendable XLM for fees. Fund a
voucher within limits, verify its return ID and outer transaction hash, and
verify that only the sponsor paid XLM fees. Confirm that a second voucher,
amount/fee over the limits and concurrent requests are rejected. Exercise an
outage and an explicit return to ordinary funding. Record hashes and observed
balances without recording keys or patient inputs. Live validation remains
dependent on the separate backend implementation.

References: [Stellar fee-bump transactions](https://developers.stellar.org/docs/build/guides/transactions/fee-bump-transactions)
and [fee sponsorship approaches](https://developers.stellar.org/docs/build/guides/transactions/fee-sponsorship).
