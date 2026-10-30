import type { Sep24AnchorConfig } from './sep24-config';
import { isAnchorUrl } from './sep24-config';

export type DiscoveredAnchor = {
  config: Sep24AnchorConfig;
  transferServer: URL;
  authEndpoint: URL;
  signingKey: string;
};

export type Sep24Transaction = {
  id: string;
  status: string;
  amount_in?: string;
  amount_out?: string;
  amount_out_asset?: string;
  amount_fee?: string;
  started_at?: string;
  completed_at?: string;
  message?: string;
  more_info_url?: string;
  external_transaction_id?: string;
};

type Fetcher = typeof fetch;
type TomlResolver = (domain: string) => Promise<{
  TRANSFER_SERVER_SEP0024?: string;
  WEB_AUTH_ENDPOINT?: string;
  SIGNING_KEY?: string;
  NETWORK_PASSPHRASE?: string;
  CURRENCIES?: Array<{ code?: string; issuer?: string }>;
}>;

const TOML_TIMEOUT_MS = 10_000;

export async function discoverAnchor(
  config: Sep24AnchorConfig,
  networkPassphrase: string,
  resolver?: TomlResolver,
): Promise<DiscoveredAnchor> {
  const resolveToml = resolver ?? defaultTomlResolver;
  const toml = await resolveToml(config.domain);
  if (toml.NETWORK_PASSPHRASE !== networkPassphrase) {
    throw new Error('The anchor is configured for a different Stellar network.');
  }
  const currencies = toml.CURRENCIES?.filter(
    (currency) => currency.code?.toUpperCase() === config.assetCode,
  ) ?? [];
  if (currencies.length !== 1 || currencies[0].issuer !== config.assetIssuer) {
    throw new Error(
      'The anchor does not publish one unambiguous currency matching the configured asset code and issuer.',
    );
  }
  if (!toml.TRANSFER_SERVER_SEP0024 || !toml.WEB_AUTH_ENDPOINT || !toml.SIGNING_KEY) {
    throw new Error('This anchor does not publish all required SEP-10/SEP-24 endpoints.');
  }

  const transferServer = trustedUrl(toml.TRANSFER_SERVER_SEP0024, config.domain);
  const authEndpoint = trustedUrl(toml.WEB_AUTH_ENDPOINT, config.domain);
  return { config, transferServer, authEndpoint, signingKey: toml.SIGNING_KEY };
}

async function defaultTomlResolver(domain: string) {
  const { StellarToml } = await import('@stellar/stellar-sdk');
  return StellarToml.Resolver.resolve(domain, {
    allowHttp: false,
    timeout: TOML_TIMEOUT_MS,
  });
}

export async function authenticateSep10(
  anchor: DiscoveredAnchor,
  account: string,
  networkPassphrase: string,
  signTransaction: (xdr: string) => Promise<string>,
  fetcher: Fetcher = fetch,
): Promise<string> {
  if (!account.startsWith('G')) {
    throw new Error('SEP-10 requires a Stellar account address beginning with G.');
  }

  const challengeUrl = new URL(anchor.authEndpoint);
  challengeUrl.searchParams.set('account', account);
  challengeUrl.searchParams.set('home_domain', anchor.config.domain);
  const challengeResponse = await fetcher(challengeUrl);
  const challengeBody = await readJson<{ transaction?: string; error?: string }>(challengeResponse);
  if (!challengeResponse.ok || !challengeBody.transaction) {
    throw new Error(challengeBody.error || 'The anchor did not return a SEP-10 challenge.');
  }

  const { WebAuth } = await import('@stellar/stellar-sdk');
  const challenge = WebAuth.readChallengeTx(
    challengeBody.transaction,
    anchor.signingKey,
    networkPassphrase,
    anchor.config.domain,
    anchor.authEndpoint.hostname,
  );
  if (challenge.clientAccountID !== account) {
    throw new Error('The anchor challenge is for a different wallet.');
  }

  const signedChallenge = await signTransaction(challenge.tx.toXDR());
  WebAuth.verifyChallengeTxSigners(
    signedChallenge,
    anchor.signingKey,
    networkPassphrase,
    [account],
    anchor.config.domain,
    anchor.authEndpoint.hostname,
  );

  const tokenResponse = await fetcher(anchor.authEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ transaction: signedChallenge }),
  });
  const tokenBody = await readJson<{ token?: string; error?: string }>(tokenResponse);
  if (!tokenResponse.ok || !tokenBody.token) {
    throw new Error(tokenBody.error || 'The anchor did not issue an authentication token.');
  }
  return tokenBody.token;
}

export type Sep24Info = {
  withdraw?: Record<string, { enabled?: boolean; min_amount?: string | number; max_amount?: string | number }>;
};

export async function getWithdrawalInfo(
  anchor: DiscoveredAnchor,
  fetcher: Fetcher = fetch,
): Promise<{ enabled: boolean; minAmount?: string | number; maxAmount?: string | number }> {
  const response = await fetcher(endpoint(anchor.transferServer, 'info'));
  const body = await readJson<Sep24Info>(response);
  if (!response.ok) throw new Error('Could not load withdrawal options from the anchor.');
  const key = `${anchor.config.assetCode}:${anchor.config.assetIssuer}`;
  const asset = body.withdraw?.[key] ?? body.withdraw?.[anchor.config.assetCode];
  return {
    enabled: asset?.enabled === true,
    minAmount: asset?.min_amount,
    maxAmount: asset?.max_amount,
  };
}

export async function startWithdrawal(
  anchor: DiscoveredAnchor,
  params: { account: string; amount: string; country: string; token: string },
  fetcher: Fetcher = fetch,
): Promise<{ id: string; url: URL }> {
  const response = await fetcher(
    endpoint(anchor.transferServer, 'transactions/withdraw/interactive'),
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        asset_code: anchor.config.assetCode,
        account: params.account,
        amount: params.amount,
        country_code: params.country,
      }),
    },
  );
  const body = await readJson<{ id?: string; url?: string; error?: string }>(response);
  if (!response.ok || !body.id || !body.url) {
    throw new Error(body.error || 'The anchor could not start a withdrawal.');
  }
  return { id: body.id, url: interactiveUrl(body.url) };
}

export async function getWithdrawalStatus(
  anchor: DiscoveredAnchor,
  id: string,
  token: string,
  fetcher: Fetcher = fetch,
): Promise<Sep24Transaction> {
  const url = endpoint(anchor.transferServer, 'transaction');
  url.searchParams.set('id', id);
  const response = await fetcher(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await readJson<{ transaction?: Sep24Transaction; error?: string }>(response);
  if (!response.ok || !body.transaction || body.transaction.id !== id) {
    throw new Error(body.error || 'Could not read the withdrawal status from the anchor.');
  }
  return body.transaction;
}

function endpoint(base: URL, path: string): URL {
  const url = new URL(base);
  const prefix = url.pathname.replace(/\/$/, '');
  url.pathname = `${prefix}/${path}`;
  return url;
}

function trustedUrl(value: string, domain: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('The anchor published an invalid service URL.');
  }
  if (!isAnchorUrl(url, domain)) {
    throw new Error('The anchor published a service outside its configured HTTPS domain.');
  }
  if (url.port) throw new Error('The anchor published a service on a non-standard HTTPS port.');
  return url;
}

function interactiveUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('The anchor returned an invalid interactive URL.');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('The anchor returned an unsafe interactive URL.');
  }
  return url;
}

async function readJson<T>(response: Response): Promise<T> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error('The anchor returned an invalid response.');
  }
  if (!body || typeof body !== 'object') {
    throw new Error('The anchor returned an invalid response.');
  }
  return body as T;
}