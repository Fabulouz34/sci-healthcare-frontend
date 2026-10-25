# SEP-24 local cash-out integration

The clinic desk can hand a clinic's USDC withdrawal to a configured Stellar
anchor. Voucher settlement and cash-out are separate: the voucher contract
releases USDC to the clinic's wallet; the anchor then runs its own off-chain
withdrawal and fiat payout process.

## Configure anchors

Set `NEXT_PUBLIC_SEP24_ANCHORS` in the build environment to a JSON array:

```json
[
  {
    "name": "Example NG anchor",
    "domain": "anchor.example",
    "countries": ["NG"],
    "assetCode": "USDC",
    "assetIssuer": "G..."
  }
]
```

Use a bare DNS domain, not a URL. Country codes are ISO 3166-1 alpha-2. The
anchor must publish `TRANSFER_SERVER_SEP0024`, `WEB_AUTH_ENDPOINT`,
`SIGNING_KEY`, the configured network passphrase and the exact asset code and
issuer in `stellar.toml`. Service endpoints must use HTTPS on the anchor's
domain or a subdomain. Their origins are added to the app's build-time CSP.
Only configure anchors that permit browser CORS for this app's deployed
origin. An unset list is supported and shows an explicit no-anchor message.

The configured asset issuer must equal `NEXT_PUBLIC_USDC_ISSUER`; matching
only the `USDC` code is not sufficient. This prevents a similarly named token
from being presented as the app's settlement asset. A smart-contract wallet
(`C...`) cannot use this SEP-10 flow; it requires a connected Stellar account
(`G...`).

## User flow and trust boundary

The browser reads each configured anchor's `stellar.toml`, confirms the
network, endpoints and asset, obtains a SEP-10 challenge, validates the
anchor's signature and wallet address with the Stellar SDK, and asks the
connected wallet to sign. The JWT is used only for the anchor's SEP-24
withdrawal request and status reads. The anchor's interactive URL opens in a
new tab, and its transaction status is polled every 12 seconds.

The anchor may require KYC, extra documents, charge fees or decline a fiat
payout. The anchor, not SCI Healthcare, determines its requirements, rates,
processing time and final delivery. The app does not collect identity
documents, guarantee local-currency availability, or change voucher/on-chain
settlement state when an anchor withdrawal changes status.

The SDF test anchor at `testanchor.stellar.org` publishes a test USDC issuer
that is different from the issuer used by this app's testnet deployment. It
is therefore not a valid cash-out target for the deployed voucher asset until
the asset configuration is aligned. Unit tests cover the authenticated SEP
flow with a compatible mock anchor; a live testnet withdrawal must be
verified with an anchor configured for the deployed issuer and a wallet that
can sign SEP-10.