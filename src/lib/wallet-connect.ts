import { config } from './config';

/**
 * Mobile wallets through WalletConnect (#163).
 *
 * Most target users are on phones without a browser extension, so the kit's
 * WalletConnect module is offered alongside Freighter and the passkey
 * wallet. It is deliberately opt-in at build time: the module needs a Reown
 * project id, and a deployment that has not configured one should not load
 * the AppKit bundle or show a wallet that cannot connect.
 */

export const WALLET_CONNECT_WALLET_ID = 'wallet_connect';

export type WalletConnectChain = 'stellar:pubnet' | 'stellar:testnet';

/** True when NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID was set at build time. */
export function isWalletConnectConfigured(): boolean {
  return config.walletConnectProjectId.trim().length > 0;
}

/** The namespaced Stellar chain the module may request for this build. */
export function walletConnectChainId(network: string): WalletConnectChain {
  return network === 'public' ? 'stellar:pubnet' : 'stellar:testnet';
}

/**
 * App metadata WalletConnect shows in the wallet app while pairing.
 *
 * `url` and `icons` must be absolute and reachable by the phone: the wallet
 * displays them outside this browser session, so a relative URL would be
 * resolved against the wallet's own origin.
 */
export function walletConnectMetadata(origin: string): {
  name: string;
  description: string;
  url: string;
  icons: string[];
} {
  const base = origin.replace(/\/+$/, '');
  return {
    name: 'SCI Healthcare',
    description:
      'Prepaid, purpose-bound care vouchers on Stellar. Money is released when an independent attester confirms care was delivered.',
    url: base,
    icons: [`${base}/icons/icon-192.png`],
  };
}
