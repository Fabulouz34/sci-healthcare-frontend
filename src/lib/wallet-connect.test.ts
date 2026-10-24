import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  WALLET_CONNECT_WALLET_ID,
  walletConnectChainId,
  walletConnectMetadata,
  isWalletConnectConfigured,
} from './wallet-connect';

/**
 * WalletConnect configuration (#163).
 *
 * The module itself talks to a phone and cannot be exercised in CI without
 * a real wallet, so the parts this app chooses — which chain to request and
 * the absolute metadata a wallet displays while pairing — are covered here.
 * `isWalletConnectConfigured` is build-time config: this file runs without
 * NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID, so it must stay off.
 */
describe('walletConnectChainId', () => {
  it('requests mainnet only for a public build', () => {
    expect(walletConnectChainId('public')).toBe('stellar:pubnet');
  });

  it('treats every other network as testnet', () => {
    expect(walletConnectChainId('testnet')).toBe('stellar:testnet');
    expect(walletConnectChainId('futurenet')).toBe('stellar:testnet');
  });
});

describe('walletConnectMetadata', () => {
  it('builds absolute URLs a phone can load while pairing', () => {
    const metadata = walletConnectMetadata('https://sci-healthcare.example/');
    expect(metadata.name).toBe('SCI Healthcare');
    expect(metadata.url).toBe('https://sci-healthcare.example');
    expect(metadata.icons).toEqual([
      'https://sci-healthcare.example/icons/icon-192.png',
    ]);
    for (const url of [metadata.url, ...metadata.icons]) {
      expect(() => new URL(url)).not.toThrow();
    }
  });
});

describe('module identity', () => {
  it('uses the kit module id for the wallet name mapping', () => {
    expect(WALLET_CONNECT_WALLET_ID).toBe('wallet_connect');
  });
});

describe('isWalletConnectConfigured', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('is off unless a project id is configured at build time', () => {
    // The unit test runs without the variable; a set value is covered by the
    // build/e2e configuration rather than mutating the imported config.
    expect(isWalletConnectConfigured()).toBe(
      Boolean(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim()),
    );
  });

  it('turns on when a build sets NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID', async () => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID', '  0123456789abcdef  ');
    const fresh = await import('./wallet-connect');
    expect(fresh.isWalletConnectConfigured()).toBe(true);
  });
});
