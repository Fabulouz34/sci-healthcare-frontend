/**
 * Browser-visible configuration.
 *
 * Every value here must be present at *build* time, because Next inlines
 * NEXT_PUBLIC_* into the client bundle. Setting them only in the hosting
 * platform's runtime environment produces a build that still points at
 * localhost — the single most common deployment failure for this shape of
 * app.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing ${name}. Set it in .env.local for local development, and in ` +
        `your host's build environment for deployments.`,
    );
  }
  return value;
}

export const config = {
  sponsoredFees: process.env.NEXT_PUBLIC_SPONSORED_FEES === 'true',
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080',
  network: process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet',
  rpcUrl:
    process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org',
  networkPassphrase:
    process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ?? 'Test SDF Network ; September 2015',
  contracts: {
    registry: process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ID ?? '',
    voucher: process.env.NEXT_PUBLIC_VOUCHER_CONTRACT_ID ?? '',
    receipt: process.env.NEXT_PUBLIC_RECEIPT_CONTRACT_ID ?? '',
    usdc: process.env.NEXT_PUBLIC_USDC_CONTRACT_ID ?? '',
    /** Testnet only: mints demo USDC to anyone, once a day each. */
    faucet: process.env.NEXT_PUBLIC_FAUCET_CONTRACT_ID ?? '',
  },
  /** Issuer of the demo USDC, needed to add the asset in a wallet. */
  usdcIssuer: process.env.NEXT_PUBLIC_USDC_ISSUER ?? '',
  /**
   * Plausible domain for cookieless usage analytics. Empty disables it
   * entirely: no script tag is rendered and no events are sent.
   */
  plausibleDomain: process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN ?? '',
  /**
   * Sentry DSN for error reporting. Empty disables it entirely: the SDK is
   * never initialised and no report leaves the browser.
   */
  sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? '',
  /**
   * WalletConnect (Reown) project id (#163). Empty keeps the kit to
   * browser-extension and passkey wallets; set it to offer mobile wallets
   * through WalletConnect.
   */
  walletConnectProjectId:
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? '',
} as const;

/**
 * True unless the app is built for Stellar's public network.
 *
 * Every testnet-only piece of UI branches on this: the header network badge,
 * the faucet and its notices, and the footer disclaimer. A production build
 * (`NEXT_PUBLIC_STELLAR_NETWORK=public`) therefore hides all of it.
 */
export const isTestnet = config.network !== 'public';

export function requireContracts(): void {
  required('NEXT_PUBLIC_VOUCHER_CONTRACT_ID', config.contracts.voucher);
  required('NEXT_PUBLIC_REGISTRY_CONTRACT_ID', config.contracts.registry);
}

export function explorerTx(hash: string): string {
  return `https://stellar.expert/explorer/${config.network}/tx/${hash}`;
}

export function explorerContract(id: string): string {
  return `https://stellar.expert/explorer/${config.network}/contract/${id}`;
}

export function explorerAccount(address: string): string {
  if (address.startsWith('C')) {
    return explorerContract(address);
  }
  return `https://stellar.expert/explorer/${config.network}/account/${address}`;
}

export function friendbotUrl(address: string): string {
  return `https://friendbot.stellar.org/?addr=${encodeURIComponent(address)}`;
}
