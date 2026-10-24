import { describe, expect, it } from 'vitest';

import {
  SEP7_MAX_MESSAGE_LENGTH,
  SEP7_TX_SCHEME,
  buildSep7TxUri,
} from './sep7';

/**
 * SEP-7 links are opened by a wallet we do not control, so the encoding has
 * to be right the first time: a malformed URI fails after the user has
 * already switched apps. These cases pin the parts the spec is specific
 * about (scheme, parameter names, percent-encoding, optional parameters).
 */

const XDR = 'AAAAAgAAAAA+2x7l4jF0hQ1m6P7vJ8nW3cKZ0dR5sT9uY2aB4eF6g==';
const TESTNET = 'Test SDF Network ; September 2015';

function parse(uri: string): URLSearchParams {
  expect(uri.startsWith(`${SEP7_TX_SCHEME}?`)).toBe(true);
  return new URLSearchParams(uri.slice(uri.indexOf('?') + 1));
}

describe('buildSep7TxUri', () => {
  it('encodes the envelope as the xdr parameter', () => {
    const params = parse(buildSep7TxUri({ xdr: XDR }));
    expect(params.get('xdr')).toBe(XDR);
    // Base64 padding and `+` must survive the round trip.
    expect(buildSep7TxUri({ xdr: XDR })).toContain('xdr=');
  });

  it('carries the testnet passphrase so the wallet signs for testnet', () => {
    const params = parse(
      buildSep7TxUri({ xdr: XDR, networkPassphrase: TESTNET }),
    );
    expect(params.get('network_passphrase')).toBe(TESTNET);
    expect(buildSep7TxUri({ xdr: XDR, networkPassphrase: TESTNET })).toContain(
      'network_passphrase=Test%20SDF%20Network%20%3B%20September%202015',
    );
  });

  it('omits optional parameters that are not provided', () => {
    const params = parse(buildSep7TxUri({ xdr: XDR }));
    expect([...params.keys()]).toEqual(['xdr']);
  });

  it('percent-encodes spaces as %20, not +', () => {
    const uri = buildSep7TxUri({ xdr: XDR, message: 'Care voucher #12' });
    expect(uri).toContain('msg=Care%20voucher%20%2312');
    expect(parse(uri).get('msg')).toBe('Care voucher #12');
  });

  it('trims the message and drops an empty one', () => {
    expect(
      parse(buildSep7TxUri({ xdr: XDR, message: '  Fund care  ' })).get('msg'),
    ).toBe('Fund care');
    expect(
      parse(buildSep7TxUri({ xdr: XDR, message: '   ' })).has('msg'),
    ).toBe(false);
  });

  it('accepts a message at the limit and rejects one over it', () => {
    const atLimit = 'a'.repeat(SEP7_MAX_MESSAGE_LENGTH);
    expect(
      parse(buildSep7TxUri({ xdr: XDR, message: atLimit })).get('msg'),
    ).toBe(atLimit);

    expect(() =>
      buildSep7TxUri({
        xdr: XDR,
        message: 'a'.repeat(SEP7_MAX_MESSAGE_LENGTH + 1),
      }),
    ).toThrow(/at most 300 characters/);
  });

  it('includes origin_domain when given and rejects a non-URL', () => {
    const params = parse(
      buildSep7TxUri({ xdr: XDR, originDomain: 'https://app.example' }),
    );
    expect(params.get('origin_domain')).toBe('https://app.example');

    expect(() =>
      buildSep7TxUri({ xdr: XDR, originDomain: 'not a domain' }),
    ).toThrow(/http\(s\) URL/);
  });

  it('includes a callback only when it is an absolute http(s) URL', () => {
    expect(
      parse(
        buildSep7TxUri({
          xdr: XDR,
          callback: 'https://app.example/sep7/callback',
        }),
      ).get('callback'),
    ).toBe('https://app.example/sep7/callback');

    expect(() =>
      buildSep7TxUri({ xdr: XDR, callback: 'javascript:alert(1)' }),
    ).toThrow(/http\(s\) URL/);
  });

  it('refuses a missing or blank envelope', () => {
    expect(() => buildSep7TxUri({ xdr: '' })).toThrow(/envelope is required/);
    expect(() => buildSep7TxUri({ xdr: '   ' })).toThrow(
      /envelope is required/,
    );
  });
});

describe('isStellarAccountAddress', () => {
  it('accepts a Stellar public key', async () => {
    const { isStellarAccountAddress } = await import('./sep7');
    expect(
      isStellarAccountAddress(
        'GCFIRY65OQE7DFP5KLNS2PF2LVZMUZYJX4OZIEQ36N2IQANUB5XVYOJR',
      ),
    ).toBe(true);
    expect(
      isStellarAccountAddress(
        '  GCFIRY65OQE7DFP5KLNS2PF2LVZMUZYJX4OZIEQ36N2IQANUB5XVYOJR  ',
      ),
    ).toBe(true);
  });

  it('rejects a secret key, a short address and junk', async () => {
    const { isStellarAccountAddress } = await import('./sep7');
    // A secret key starts with S; it must never be pasted into the payer box.
    expect(
      isStellarAccountAddress(
        'SBQPDFX7YQ2ZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQZQ',
      ),
    ).toBe(false);
    expect(isStellarAccountAddress('GABC')).toBe(false);
    expect(isStellarAccountAddress('')).toBe(false);
  });
});
