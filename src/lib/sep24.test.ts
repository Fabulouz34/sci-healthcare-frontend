import { Keypair, Networks, TransactionBuilder, WebAuth } from '@stellar/stellar-sdk';
import { describe, expect, it, vi } from 'vitest';

import { parseSep24Anchors, supportsCountry } from './sep24-config';
import {
  authenticateSep10,
  discoverAnchor,
  getWithdrawalInfo,
  getWithdrawalStatus,
  startWithdrawal,
  type DiscoveredAnchor,
} from './sep24';

const ACCOUNT = Keypair.random();
const SERVER = Keypair.random();
const ASSET_ISSUER = 'GCKX5KAFVF7GLFZ3JWQGJ4F62RYYZU67PI3TACBGKVPJ73JELMI3L4KR';

function configuredAnchor() {
  return parseSep24Anchors(JSON.stringify([
    {
      name: 'Test anchor',
      domain: 'anchor.example',
      countries: ['ng'],
      assetCode: 'USDC',
      assetIssuer: ASSET_ISSUER,
    },
  ]))[0];
}

function toml(overrides: Record<string, unknown> = {}) {
  return {
    TRANSFER_SERVER_SEP0024: 'https://anchor.example/sep24',
    WEB_AUTH_ENDPOINT: 'https://anchor.example/auth',
    SIGNING_KEY: SERVER.publicKey(),
    NETWORK_PASSPHRASE: Networks.TESTNET,
    CURRENCIES: [{ code: 'USDC', issuer: ASSET_ISSUER }],
    ...overrides,
  };
}

async function anchor(): Promise<DiscoveredAnchor> {
  return discoverAnchor(configuredAnchor(), Networks.TESTNET, async () => toml());
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('SEP-24 anchor config and protocol', () => {
  it('validates JSON anchor config and normalizes countries and asset codes', () => {
    const [config] = parseSep24Anchors(JSON.stringify([
      {
        name: 'Cash desk',
        domain: 'ANCHOR.example',
        countries: ['ng', 'NG'],
        assetCode: 'usdc',
        assetIssuer: ASSET_ISSUER,
      },
    ]));

    expect(config.domain).toBe('anchor.example');
    expect(config.countries).toEqual(['NG']);
    expect(config.assetCode).toBe('USDC');
    expect(supportsCountry(config, 'ng')).toBe(true);
    expect(() => parseSep24Anchors('{')).toThrow(/valid JSON/);
    expect(() => parseSep24Anchors(JSON.stringify([{ ...config, domain: 'http://anchor.example' }]))).toThrow(/bare HTTPS domain/);
    expect(() => parseSep24Anchors(JSON.stringify([{ ...config, domain: 'anchor.example:443' }]))).toThrow(/bare HTTPS domain/);
    expect(() => parseSep24Anchors(JSON.stringify([{ ...config, domain: 'anchor.example/path' }]))).toThrow(/bare HTTPS domain/);
  });

  it('requires the anchor network, asset issuer, and same-domain endpoints to match', async () => {
    await expect(
      discoverAnchor(configuredAnchor(), Networks.TESTNET, async () =>
        toml({ NETWORK_PASSPHRASE: Networks.PUBLIC }),
      ),
    ).rejects.toThrow(/different Stellar network/);
    await expect(
      discoverAnchor(configuredAnchor(), Networks.TESTNET, async () =>
        toml({ CURRENCIES: [{ code: 'USDC', issuer: SERVER.publicKey() }] }),
      ),
    ).rejects.toThrow(/configured asset code and issuer/);
    await expect(
      discoverAnchor(configuredAnchor(), Networks.TESTNET, async () =>
        toml({ CURRENCIES: [
          { code: 'USDC', issuer: ASSET_ISSUER },
          { code: 'USDC', issuer: SERVER.publicKey() },
        ] }),
      ),
    ).rejects.toThrow(/one unambiguous currency/);
    await expect(
      discoverAnchor(configuredAnchor(), Networks.TESTNET, async () =>
        toml({ WEB_AUTH_ENDPOINT: 'https://attacker.example/auth' }),
      ),
    ).rejects.toThrow(/outside its configured HTTPS domain/);
  });

  it('validates and signs a SEP-10 challenge before returning the JWT', async () => {
    const service = await anchor();
    const challenge = WebAuth.buildChallengeTx(
      SERVER,
      ACCOUNT.publicKey(),
      'anchor.example',
      300,
      Networks.TESTNET,
      'anchor.example',
    );
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(input.toString());
      if (init?.method === 'POST') {
        expect(new URLSearchParams(String(init.body)).get('transaction')).toBeTruthy();
        return response({ token: 'anchor-jwt' });
      }
      expect(url.searchParams.get('account')).toBe(ACCOUNT.publicKey());
      return response({ transaction: challenge });
    });
    const signTransaction = async (xdr: string) => {
      const transaction = TransactionBuilder.fromXDR(xdr, Networks.TESTNET);
      transaction.sign(ACCOUNT);
      return transaction.toXDR();
    };

    await expect(
      authenticateSep10(service, ACCOUNT.publicKey(), Networks.TESTNET, signTransaction, fetcher),
    ).resolves.toBe('anchor-jwt');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('rejects a SEP-10 challenge issued for a different wallet before signing', async () => {
    const service = await anchor();
    const wrongAccount = Keypair.random();
    const challenge = WebAuth.buildChallengeTx(
      SERVER,
      wrongAccount.publicKey(),
      'anchor.example',
      300,
      Networks.TESTNET,
      'anchor.example',
    );
    const signTransaction = vi.fn(async (xdr: string) => xdr);
    const fetcher = vi.fn<typeof fetch>(async () => response({ transaction: challenge }));

    await expect(
      authenticateSep10(service, ACCOUNT.publicKey(), Networks.TESTNET, signTransaction, fetcher),
    ).rejects.toThrow(/different wallet/);
    expect(signTransaction).not.toHaveBeenCalled();
  });

  it('reads SEP-24 limits, starts an interactive withdrawal, and verifies polled IDs', async () => {
    const service = await anchor();
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(input.toString());
      if (url.pathname.endsWith('/info')) {
        return response({ withdraw: { [`USDC:${ASSET_ISSUER}`]: { enabled: true, min_amount: 1, max_amount: 100 } } });
      }
      if (url.pathname.endsWith('/interactive')) {
        const body = new URLSearchParams(String(init?.body));
        expect(body.get('account')).toBe(ACCOUNT.publicKey());
        expect(body.get('country_code')).toBe('NG');
        expect(init?.headers).toMatchObject({ Authorization: 'Bearer jwt' });
        return response({ id: 'withdrawal-1', url: 'https://kyc.partner.example/withdraw/1' });
      }
      return response({ transaction: { id: 'withdrawal-1', status: 'pending_user' } });
    });

    await expect(getWithdrawalInfo(service, fetcher)).resolves.toEqual({
      enabled: true,
      minAmount: 1,
      maxAmount: 100,
    });
    const started = await startWithdrawal(
      service,
      { account: ACCOUNT.publicKey(), amount: '5.00', country: 'NG', token: 'jwt' },
      fetcher,
    );
    expect(started.id).toBe('withdrawal-1');
    expect(started.url.href).toBe('https://kyc.partner.example/withdraw/1');
    await expect(getWithdrawalStatus(service, started.id, 'jwt', fetcher)).resolves.toMatchObject({
      id: 'withdrawal-1',
      status: 'pending_user',
    });
    await expect(
      getWithdrawalStatus(service, 'different-id', 'jwt', async () =>
        response({ transaction: { id: 'withdrawal-1', status: 'completed' } }),
      ),
    ).rejects.toThrow(/status from the anchor/);
    await expect(
      startWithdrawal(
        service,
        { account: ACCOUNT.publicKey(), amount: '5.00', country: 'NG', token: 'jwt' },
        async () => response({ id: 'withdrawal-2', url: 'javascript:alert(1)' }),
      ),
    ).rejects.toThrow(/unsafe interactive URL/);
  });
});