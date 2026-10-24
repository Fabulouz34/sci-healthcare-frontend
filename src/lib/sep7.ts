/**
 * SEP-7 payment links (Stellar Ecosystem Proposal 7).
 *
 * A `web+stellar:tx` URI carries a *prepared* transaction envelope. The user
 * opens it with any SEP-7 compatible wallet — including a mobile wallet such
 * as LOBSTR — which signs and submits the transaction. That is what opens
 * funding to people who do not have a browser extension, without the app
 * ever holding a key.
 *
 * The URI is deliberately built in a pure function: the encoding is the part
 * that is easy to get subtly wrong (a `+` where a wallet expects `%20`, an
 * unencoded envelope, a missing network passphrase on testnet), and it is
 * testable without a wallet or a network.
 *
 * Spec: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0007.md
 */

/** The scheme and operation for a prepared transaction. */
export const SEP7_TX_SCHEME = 'web+stellar:tx';

/**
 * SEP-7 caps `msg` at 300 characters. Wallets show it to the user before
 * signing, so it is also the natural place to say what the payment is for.
 */
export const SEP7_MAX_MESSAGE_LENGTH = 300;

export type Sep7TxRequest = {
  /** Base64 transaction envelope XDR to sign, as `Transaction.toXDR()`. */
  xdr: string;
  /** Optional message shown to the user in the wallet. */
  message?: string;
  /**
   * Only needed when the transaction is not for the public network; wallets
   * default to `Public Global Stellar Network ; September 2015`.
   */
  networkPassphrase?: string;
  /** The app's domain, so the wallet can show where the request came from. */
  originDomain?: string;
  /**
   * Optional SEP-7 callback. The app cannot receive one (it has no server),
   * so it polls the ledger instead and leaves this unset.
   */
  callback?: string;
};

/**
 * Builds the `web+stellar:tx?…` URI.
 *
 * Throws on a missing envelope, an over-long message, or a non-http(s)
 * callback/origin: a malformed link is worse than no link, because the user
 * only discovers it after opening the wallet.
 */
export function buildSep7TxUri(request: Sep7TxRequest): string {
  const xdr = request.xdr?.trim();
  if (!xdr) {
    throw new Error('A prepared transaction envelope is required for a SEP-7 link.');
  }

  const params = new URLSearchParams({ xdr });

  if (request.message !== undefined) {
    const message = request.message.trim();
    if (message.length > SEP7_MAX_MESSAGE_LENGTH) {
      throw new Error(
        `A SEP-7 message must be at most ${SEP7_MAX_MESSAGE_LENGTH} characters.`,
      );
    }
    if (message) params.set('msg', message);
  }

  if (request.networkPassphrase) {
    params.set('network_passphrase', request.networkPassphrase);
  }

  if (request.originDomain) {
    assertHttpUrl(request.originDomain, 'origin_domain');
    params.set('origin_domain', request.originDomain);
  }

  if (request.callback) {
    assertHttpUrl(request.callback, 'callback');
    params.set('callback', request.callback);
  }

  // `URLSearchParams` uses `+` for spaces. Form-encoded `+` is legal in a
  // query string, but wallets implement the URI spec and expect `%20`, so
  // normalise it rather than relying on every wallet to decode both.
  return `${SEP7_TX_SCHEME}?${params.toString().replaceAll('+', '%20')}`;
}

function assertHttpUrl(value: string, name: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`SEP-7 ${name} must be an absolute http(s) URL.`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`SEP-7 ${name} must be an absolute http(s) URL.`);
  }
}

/** `G` followed by 55 base32 characters: a Stellar account address. */
const STELLAR_ACCOUNT = /^G[A-Z2-7]{55}$/;

/**
 * Whether a string looks like a Stellar account the wallet could sign with.
 * Deliberately a shape check, not a checksum: the wallet and the network
 * reject a bad address, and a shape check is enough to keep an obvious typo
 * out of a prepared transaction.
 */
export function isStellarAccountAddress(value: string): boolean {
  return STELLAR_ACCOUNT.test(value.trim());
}
