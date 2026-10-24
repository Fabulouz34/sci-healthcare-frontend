import type { xdr } from '@stellar/stellar-sdk';

import { toBaseUnits } from './amounts';
import { config } from './config';
import {
  isMockRpc,
  mockRpcDelayMs,
  mockRpcRead,
  mockSep7Submission,
  recordMockCall,
} from './e2e-seam';
import { beginPendingTransaction } from './pending-tx';
import { humaniseHorizonResult } from './errors';

/**
 * Stellar SDK access.
 *
 * The SDK (~large) is split out of the initial bundle: every page that only
 * reads the indexer never imports it. It loads on demand the first time a
 * write is simulated, submitted or read via `simulateTransaction`.
 * Static `import type` above is erased at build time and costs nothing.
 */

type Sdk = typeof import('@stellar/stellar-sdk');

let sdkPromise: Promise<Sdk> | null = null;
function loadSdk(): Promise<Sdk> {
  if (!sdkPromise) sdkPromise = import('@stellar/stellar-sdk');
  return sdkPromise;
}

type RpcServer = InstanceType<Sdk['rpc']['Server']>;
let cachedServer: RpcServer | null = null;

type HorizonServer = InstanceType<Sdk['Horizon']['Server']>;
let cachedHorizonServer: HorizonServer | null = null;

async function getServer(): Promise<RpcServer> {
  if (cachedServer) return cachedServer;
  const { rpc } = await loadSdk();
  cachedServer = new rpc.Server(config.rpcUrl, {
    allowHttp: config.rpcUrl.startsWith('http://'),
  });
  return cachedServer;
}

async function getHorizonServer(): Promise<HorizonServer> {
  if (cachedHorizonServer) return cachedHorizonServer;
  const { Horizon } = await loadSdk();
  cachedHorizonServer = new Horizon.Server(horizonBaseUrl(), {
    allowHttp: horizonBaseUrl().startsWith('http://'),
  });
  return cachedHorizonServer;
}

export type SignFn = (xdrString: string) => Promise<string>;

export const MIN_FEE_BUFFER_XLM = 1.0;
export const PATH_PAYMENT_SLIPPAGE_BPS = 100;

export interface SpendableXlmInfo {
  rawBalance: number;
  minBalance: number;
  spendable: number;
  isLowForFees: boolean;
}

export interface XlmSwapQuote {
  usdcAmount: bigint;
  xlmCost: bigint;
  maxXlm: bigint;
  slippageBps: number;
}

function toDecimalString(value: bigint, decimals = 7): string {
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const frac = (value % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole.toString()}`;
}

export async function quoteXlmForUsdc(
  usdcAmount: bigint,
  slippageBps = PATH_PAYMENT_SLIPPAGE_BPS,
): Promise<XlmSwapQuote> {
  if (usdcAmount <= 0n) {
    return {
      usdcAmount: 0n,
      xlmCost: 0n,
      maxXlm: 0n,
      slippageBps,
    };
  }

  if (isMockRpc()) {
    const cost = usdcAmount / 100n + 1n;
    const max = cost + (cost * BigInt(slippageBps) / 10_000n);
    return {
      usdcAmount,
      xlmCost: cost,
      maxXlm: max,
      slippageBps,
    };
  }

  if (!config.usdcIssuer) {
    throw new Error('USDC issuer is not configured for an XLM path payment.');
  }

  const { Asset } = await loadSdk();
  const server = await getHorizonServer();
  const destAsset = new Asset('USDC', config.usdcIssuer);
  const pathCall = server.strictReceivePaths(
    [Asset.native()],
    destAsset,
    toDecimalString(usdcAmount),
  );
  const paths = await pathCall.call();
  const best = (paths as { records?: Array<{ source_amount?: string }> }).records?.[0];
  if (!best) {
    throw new Error('No XLM → USDC path is available for this voucher amount.');
  }

  const xlmCost = toBaseUnits(best.source_amount ?? '0');
  const maxXlm = xlmCost + (xlmCost * BigInt(slippageBps) / 10_000n);
  return {
    usdcAmount,
    xlmCost,
    maxXlm,
    slippageBps,
  };
}

export async function invokePathPaymentThenContract(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  walletAddress: string,
  sign: SignFn,
  { usdcAmount, slippageBps = PATH_PAYMENT_SLIPPAGE_BPS }: { usdcAmount: bigint; slippageBps?: number },
): Promise<{ hash: string; returnValue: unknown }> {
  if (usdcAmount <= 0n) {
    return invoke(contractId, method, args, walletAddress, sign);
  }

  const quote = await quoteXlmForUsdc(usdcAmount, slippageBps);
  if (isMockRpc()) {
    recordMockCall({ kind: 'invoke', contractId, method });
    return { hash: 'ab'.repeat(32), returnValue: mockReturnValue(method) };
  }

  const { Asset, BASE_FEE, Contract, Operation, TransactionBuilder, rpc, scValToNative } =
    await loadSdk();
  const server = await getServer();
  const account = await server.getAccount(walletAddress);
  const usdcAsset = new Asset('USDC', config.usdcIssuer);

  const built = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(
      Operation.pathPaymentStrictReceive({
        destination: walletAddress,
        sendAsset: Asset.native(),
        sendMax: toDecimalString(quote.maxXlm),
        destAsset: usdcAsset,
        destAmount: toDecimalString(usdcAmount),
      }),
    )
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(180)
    .build();

  const sim = await server.simulateTransaction(built);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(sim.error);
  }

  const prepared = rpc.assembleTransaction(built, sim).build();
  const signedXdr = await sign(prepared.toXDR());
  const signed = TransactionBuilder.fromXDR(signedXdr, config.networkPassphrase);

  const sent = await server.sendTransaction(signed);
  if (sent.status === 'ERROR') {
    throw new Error(
      `Transaction rejected: ${JSON.stringify(sent.errorResult ?? sent.status)}`,
    );
  }

  const result = await waitForTransaction(sent.hash);
  return {
    hash: sent.hash,
    returnValue: result.returnValue ? scValToNative(result.returnValue) : null,
  };
}

interface HorizonBalanceLine {
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  balance: string;
}

interface HorizonAccountRecord {
  balances: HorizonBalanceLine[];
  subentry_count: number;
}

/** Body of Horizon's answer to `POST /transactions`. */
interface HorizonSubmitResponse {
  hash?: string;
  extras?: {
    result_codes?: { tx?: string; operations?: string[] };
  };
}

function horizonBaseUrl(): string {
  if (config.network === 'public') return 'https://horizon.stellar.org';
  if (config.network === 'futurenet') return 'https://horizon-futurenet.stellar.org';
  return 'https://horizon-testnet.stellar.org';
}

/**
 * Checks whether an account exists on the network (is funded with XLM).
 * Soroban RPC returns 404 / account not found for brand new accounts.
 */
export async function checkAccountFunded(address: string): Promise<boolean> {
  if (isMockRpc()) {
    if (
      typeof window !== 'undefined' &&
      (window as unknown as { __SCI_UNFUNDED_ACCOUNT__?: boolean })
        .__SCI_UNFUNDED_ACCOUNT__
    ) {
      return false;
    }
    return true;
  }
  try {
    const server = await getServer();
    await server.getAccount(address);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/not found|404/i.test(message)) {
      return false;
    }
    return true;
  }
}

/**
 * Reads native balance and subentries to compute spendable XLM balance (#61).
 * In Stellar, min balance = (2 + subentries) * base_reserve (0.5 XLM).
 * Returns isLowForFees=true when spendable XLM is below MIN_FEE_BUFFER_XLM.
 */
export async function getAccountSpendableBalance(
  address: string,
): Promise<SpendableXlmInfo | null> {
  if (isMockRpc()) {
    if (
      typeof window !== 'undefined' &&
      (window as unknown as { __SCI_LOW_XLM_BALANCE__?: boolean })
        .__SCI_LOW_XLM_BALANCE__
    ) {
      return {
        rawBalance: 1.0,
        minBalance: 1.0,
        spendable: 0.0,
        isLowForFees: true,
      };
    }
    return {
      rawBalance: 100.0,
      minBalance: 1.0,
      spendable: 99.0,
      isLowForFees: false,
    };
  }

  try {
    const url = `${horizonBaseUrl()}/accounts/${address}`;
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    const account = (await res.json()) as Partial<HorizonAccountRecord>;
    const balances = Array.isArray(account.balances) ? account.balances : [];
    const nativeEntry = balances.find((b) => b.asset_type === 'native');
    const nativeBalance = nativeEntry && typeof nativeEntry.balance === 'string'
      ? Number(nativeEntry.balance)
      : 0;
    const rawBalance = Number.isFinite(nativeBalance) ? nativeBalance : 0;
    const subentries = Number.isFinite(account.subentry_count) ? Number(account.subentry_count) : 0;
    const minBalance = (2 + subentries) * 0.5;
    const spendable = Math.max(0, rawBalance - minBalance);
    return {
      rawBalance,
      minBalance,
      spendable,
      isLowForFees: spendable < MIN_FEE_BUFFER_XLM,
    };
  } catch {
    return null;
  }
}

// ----- USDC trustline (#1) -----
//
// Stellar assets are opt-in: an account can only hold USDC once it carries
// a balance line (a "trustline") for that issuer. Without one, the first
// USDC transfer a voucher makes fails deep inside the token with a raw host
// error, so the funding form checks the line and offers to add it *before*
// it offers to fund.

export interface UsdcTrustlineInfo {
  /** True when the account carries a balance line for the given issuer. */
  hasTrustline: boolean;
  /** Balance in base units when the line exists, otherwise null. */
  balance: bigint | null;
}

/**
 * Finds the USDC line in a Horizon account payload.
 *
 * Split from the fetch so the matching rules (code *and* issuer — either
 * alone can match something else) are unit-testable without the network.
 */
export function usdcTrustlineFromAccount(
  account: HorizonAccountRecord,
  issuer: string,
): UsdcTrustlineInfo {
  const line = account.balances.find(
    (b) =>
      (b.asset_type === 'credit_alphanum4' ||
        b.asset_type === 'credit_alphanum12') &&
      b.asset_code === 'USDC' &&
      b.asset_issuer === issuer,
  );
  if (!line) return { hasTrustline: false, balance: null };
  try {
    return { hasTrustline: true, balance: toBaseUnits(line.balance) };
  } catch {
    // A balance we cannot parse still means the line exists.
    return { hasTrustline: true, balance: null };
  }
}

/**
 * Reads the connected wallet's USDC trustline from Horizon, or `null` when
 * the answer is unknown: no issuer configured, the account is not funded
 * yet, or Horizon did not answer.
 *
 * `null` fails open — the funding form keeps working exactly as it did
 * before this check existed, because a transient read must never block a
 * payment that would otherwise succeed.
 */
export async function getUsdcTrustline(
  address: string,
): Promise<UsdcTrustlineInfo | null> {
  if (!config.usdcIssuer) return null;

  if (isMockRpc()) {
    // Playwright (src/lib/e2e-seam.ts): the mock account holds USDC unless
    // a test sets `window.__SCI_NO_TRUSTLINE__` in an addInitScript.
    const missing =
      typeof window !== 'undefined' &&
      (window as unknown as { __SCI_NO_TRUSTLINE__?: boolean })
        .__SCI_NO_TRUSTLINE__;
    if (missing) return { hasTrustline: false, balance: null };
    return { hasTrustline: true, balance: 100_0000000n };
  }

  try {
    const res = await fetch(`${horizonBaseUrl()}/accounts/${address}`, {
      headers: { accept: 'application/json' },
    });
    // 404 = the account has no XLM yet, so there is no line to add either;
    // the unfunded warning in the wallet menu already covers that case.
    if (!res.ok) return null;
    const account = (await res.json()) as HorizonAccountRecord;
    return usdcTrustlineFromAccount(account, config.usdcIssuer);
  } catch {
    return null;
  }
}

/** One trustline locks one subentry at the base reserve (0.5 XLM). */
const TRUSTLINE_RESERVE_XLM = 0.5;
/** Fee for a single-operation transaction. */
const CHANGE_TRUST_FEE_XLM = 0.0001;

/**
 * Builds a `changeTrust` for USDC, has the wallet sign it, and submits it.
 *
 * This is a classic asset operation, so it goes to Horizon rather than
 * Soroban RPC, and it has no simulation step the way a contract call does
 * (`invokeContract`). The failure a simulation would have caught — not
 * enough spendable XLM to lock the reserve — is therefore checked against
 * the account *before* the wallet is asked to sign, and everything else is
 * reported from Horizon's own result codes. The round trip counts as a
 * pending write, so the unload guard covers it like every other write.
 */
export async function addUsdcTrustline(
  address: string,
  sign: SignFn,
): Promise<{ hash: string }> {
  const issuer = config.usdcIssuer;
  if (!issuer) {
    throw new Error('This deployment has no USDC issuer configured.');
  }
  const { Account, Asset, BASE_FEE, Operation, StrKey, TransactionBuilder } =
    await loadSdk();
  if (!StrKey.isValidEd25519PublicKey(issuer)) {
    throw new Error('This deployment’s USDC issuer is not a valid Stellar address.');
  }

  const finish = beginPendingTransaction();
  try {
    const mocked = isMockRpc();

    if (!mocked) {
      const spendable = await getAccountSpendableBalance(address);
      if (
        spendable &&
        spendable.spendable < TRUSTLINE_RESERVE_XLM + CHANGE_TRUST_FEE_XLM
      ) {
        throw new Error(
          `Holding USDC locks ${TRUSTLINE_RESERVE_XLM} XLM as a reserve and ` +
            `your spendable balance is ${spendable.spendable} XLM. Top up ` +
            'your wallet, then press Add USDC again.',
        );
      }
    }

    const account = mocked
      ? new Account(address, '0')
      : await (await getServer()).getAccount(address);
    const built = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: config.networkPassphrase,
    })
      .addOperation(Operation.changeTrust({ asset: new Asset('USDC', issuer) }))
      .setTimeout(180)
      .build();

    const signedXdr = await sign(built.toXDR());
    const signed = TransactionBuilder.fromXDR(
      signedXdr,
      config.networkPassphrase,
    );

    if (mocked) {
      recordMockCall({
        kind: 'change_trust',
        contractId: config.contracts.usdc,
        method: 'change_trust',
      });
      const delay = mockRpcDelayMs();
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      // The mock ledger applies the change at once, so the re-read after
      // signing finds the line that was just added.
      (window as unknown as { __SCI_NO_TRUSTLINE__?: boolean }).__SCI_NO_TRUSTLINE__ =
        false;
      return { hash: 'ab'.repeat(32) };
    }

    return await submitSigned(signed);
  } finally {
    finish();
  }
}

/** Submits a signed classic transaction to Horizon and returns its hash. */
async function submitSigned(
  signed:
    | import('@stellar/stellar-sdk').Transaction
    | import('@stellar/stellar-sdk').FeeBumpTransaction,
): Promise<{ hash: string }> {
  let res: Response;
  try {
    res = await fetch(`${horizonBaseUrl()}/transactions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tx: signed.toXDR() }),
    });
  } catch {
    throw new Error(
      'Could not reach the Stellar network, so nothing was sent. Check your ' +
        'connection and try again.',
    );
  }
  const body = (await res.json().catch(() => null)) as
    | HorizonSubmitResponse
    | null;
  if (res.ok && body?.hash) return { hash: body.hash };
  throw new Error(humaniseHorizonResult(res.status, body?.extras?.result_codes));
}

/** How long to wait for a submitted transaction to reach a final status. */
const CONFIRM_TIMEOUT_MS = 45_000;
const POLL_INTERVAL_MS = 1_500;

/**
 * Builds, simulates, signs and submits a contract invocation.
 *
 * Simulation happens before signing so the user is never asked to approve a
 * transaction that is already known to fail — the contract error surfaces
 * as a readable message instead of a wallet rejection.
 */
export async function invokeContract(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  walletAddress: string,
  sign: SignFn,
  sponsored = false,
): Promise<{ hash: string; returnValue: unknown }> {
  // The whole round trip counts as pending: while it runs, the app warns
  // before the tab is closed or reloaded (see pending-tx.ts and
  // PendingTransactionGuard).
  const finish = beginPendingTransaction();
  try {
    return await invoke(contractId, method, args, walletAddress, sign, sponsored);
  } finally {
    finish();
  }
}

export type ContractCall = {
  contractId: string;
  method: string;
  args: xdr.ScVal[];
  walletAddress: string;
};

/**
 * Encourages batched call flows when the wallet/SDK supports them, while
 * keeping the app resilient: a single call can always fall back to individual
 * invocations. The app still loops over results so it can stop on the first
 * failure and report which services succeeded.
 */
export async function invokeContractBatch(
  calls: ContractCall[],
  sign: SignFn,
): Promise<Array<{ hash: string; returnValue: unknown }>> {
  if (calls.length === 0) return [];

  const results: Array<{ hash: string; returnValue: unknown }> = [];
  for (const call of calls) {
    results.push(await invoke(call.contractId, call.method, call.args, call.walletAddress, sign));
  }
  return results;
}

async function invoke(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  walletAddress: string,
  sign: SignFn,
  sponsored = false,
): Promise<{ hash: string; returnValue: unknown }> {
  const { TransactionBuilder, scValToNative } = await loadSdk();
  let sponsor: typeof import('./sponsorship') | undefined;
  if (sponsored) {
    // Keep fee-bump validation off the ordinary wallet/read-page bundle.
    sponsor = await import('./sponsorship');
    if (contractId !== config.contracts.voucher || method !== 'create_voucher' || args.length !== 6) {
      throw new Error('Only voucher funding can use sponsored fees.');
    }
    const amount: unknown = scValToNative(args[4]);
    if (typeof amount !== 'bigint') throw new Error('Invalid sponsored voucher amount.');
    sponsor.requireSponsorship(amount);
  }

  // Playwright end-to-end tests (see e2e-seam.ts): record the invocation and
  // return a canned submission instead of building, simulating and sending
  // a real transaction. Crafting Soroban simulation payloads over HTTP
  // would couple the tests to SDK internals; this keeps the same
  // `{ hash, returnValue }` shape the UI consumes.
  const prepared = await prepareInvocation(
    contractId,
    method,
    args,
    walletAddress,
    !sponsored,
  );
  if (isMockRpc() && !sponsored) {
    const delay = mockRpcDelayMs();
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    return { hash: 'ab'.repeat(32), returnValue: mockReturnValue(method) };
  }

  const unsigned = TransactionBuilder.fromXDR(prepared.xdr, config.networkPassphrase);
  if (!('sequence' in unsigned)) throw new Error('Expected an unsigned inner transaction.');
  const signed = sponsor
    ? await sponsor.sponsorTransaction(unsigned, sign)
    : TransactionBuilder.fromXDR(await sign(prepared.xdr), config.networkPassphrase);

  const server = await getServer();
  const sent = await server.sendTransaction(signed);
  if (sent.status === 'ERROR') {
    throw new Error(
      `Transaction rejected: ${JSON.stringify(sent.errorResult ?? sent.status)}`,
    );
  }

  const result = await waitForTransaction(sent.hash);
  return {
    hash: sent.hash,
    returnValue: result.returnValue ? scValToNative(result.returnValue) : null,
  };
}

/**
 * A contract invocation that has been built and simulated but not signed.
 *
 * This is what a SEP-7 payment link carries (#162): the wallet signs and
 * submits it, so the app needs the exact envelope rather than the result.
 * `sequence` is the transaction's own sequence number, which is how the
 * poller recognises *this* transaction once it reaches the ledger.
 */
export type PreparedInvocation = {
  /** Base64 transaction envelope XDR, unsigned. */
  xdr: string;
  /** The account that must sign (and pay the fee). */
  source: string;
  /** The envelope's sequence number, as a decimal string. */
  sequence: string;
  contractId: string;
  method: string;
  networkPassphrase: string;
};

/**
 * Builds and simulates a contract invocation without signing it.
 *
 * Simulation happens before the user is asked to sign, so a transaction that
 * is known to fail surfaces as a readable error rather than in the wallet.
 * The returned envelope already carries the simulated footprint, resource
 * fees and auth entries, which is what makes it safe to hand to a wallet.
 */
export async function prepareContractInvocation(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  source: string,
): Promise<PreparedInvocation> {
  return prepareInvocation(contractId, method, args, source, true);
}

/** Sponsored calls must exercise real preparation even in the browser test seam. */
async function prepareInvocation(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  source: string,
  allowMock: boolean,
): Promise<PreparedInvocation> {
  if (allowMock && isMockRpc()) {
    recordMockCall({ kind: 'invoke', contractId, method }, recordArgs(args));
    return {
      // Not a real envelope: Playwright only checks that the SEP-7 URI is
      // built and that the UI advances when the mock reports a submission.
      xdr: globalThis.btoa(`sci-sep7-mock:${method}`),
      source,
      sequence: '1',
      contractId,
      method,
      networkPassphrase: config.networkPassphrase,
    };
  }

  const { BASE_FEE, Contract, rpc, TransactionBuilder } = await loadSdk();
  const server = await getServer();

  const account = await server.getAccount(source);
  const contract = new Contract(contractId);

  const built = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(180)
    .build();

  const sim = await server.simulateTransaction(built);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(sim.error);
  }

  // assembleTransaction folds in the simulated footprint, resource fees and
  // auth entries. Submitting without this fails with a resource error.
  const prepared = rpc.assembleTransaction(built, sim).build();

  return {
    xdr: prepared.toXDR(),
    source,
    sequence: prepared.sequence,
    contractId,
    method,
    networkPassphrase: config.networkPassphrase,
  };
}

/** How long to wait for a wallet to sign and submit a SEP-7 transaction. */
export const SEP7_CONFIRM_TIMEOUT_MS = 180_000;
export const SEP7_POLL_INTERVAL_MS = 3_000;

export type Sep7PollOptions = {
  timeoutMs?: number;
  intervalMs?: number;
  signal?: AbortSignal;
};

/**
 * Waits until the wallet has submitted the prepared transaction.
 *
 * SEP-7 wallets submit to their own infrastructure, so there is no response
 * to await: the ledger is the only source of truth. The poller watches the
 * source account's sequence number (cheap) and, once it has advanced, looks
 * for the transaction whose envelope sequence matches the prepared one. That
 * proves *this* transaction landed rather than some other payment from the
 * same account.
 */
export async function waitForPreparedInvocation(
  prepared: PreparedInvocation,
  options: Sep7PollOptions = {},
): Promise<{ hash: string }> {
  const timeoutMs = options.timeoutMs ?? SEP7_CONFIRM_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? SEP7_POLL_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;
  const expectedSequence = BigInt(prepared.sequence);

  while (Date.now() < deadline) {
    if (options.signal?.aborted) throw new Error('Stopped waiting for the wallet.');

    if (isMockRpc()) {
      const submitted = mockSep7Submission();
      if (submitted) return { hash: submitted.hash };
    } else {
      try {
        const hash = await findSubmittedTransaction(prepared, expectedSequence);
        if (hash) return { hash };
      } catch {
        // A transient Horizon failure is not a failed payment: keep polling
        // until the deadline rather than telling the funder it went wrong.
      }
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    'The wallet has not submitted the payment yet. It may still be open — ' +
      'check the wallet, then try again.',
  );
}

async function findSubmittedTransaction(
  prepared: PreparedInvocation,
  expectedSequence: bigint,
): Promise<string | null> {
  const { TransactionBuilder } = await loadSdk();
  const server = await getHorizonServer();

  const account = (await server.accounts().accountId(prepared.source).call()) as {
    sequence?: string;
  };
  const currentSequence = account.sequence ? BigInt(account.sequence) : 0n;
  if (currentSequence <= expectedSequence) return null;

  const page = (await server
    .transactions()
    .forAccount(prepared.source)
    .order('desc')
    .limit(10)
    .call()) as {
    records?: Array<{
      hash: string;
      source_account: string;
      successful?: boolean;
      envelope_xdr: string;
    }>;
  };

  for (const record of page.records ?? []) {
    if (record.source_account !== prepared.source) continue;
    if (record.successful === false) continue;
    try {
      const tx = TransactionBuilder.fromXDR(
        record.envelope_xdr,
        prepared.networkPassphrase,
      );
      // A fee-bump envelope wraps the transaction we prepared; its inner
      // transaction carries the sequence we are looking for.
      const sequence =
        'sequence' in tx ? tx.sequence : tx.innerTransaction.sequence;
      if (BigInt(sequence) === expectedSequence) return record.hash;
    } catch {
      // A malformed or non-transaction envelope is not ours; keep looking.
    }
  }
  return null;
}

async function waitForTransaction(
  hash: string,
): Promise<
  import('@stellar/stellar-sdk').rpc.Api.GetSuccessfulTransactionResponse
> {
  const { rpc } = await loadSdk();
  const server = await getServer();
  const deadline = Date.now() + CONFIRM_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const res = await server.getTransaction(hash);

    if (res.status === rpc.Api.GetTransactionStatus.SUCCESS) return res;
    if (res.status === rpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(
        `Transaction failed on chain: ${JSON.stringify(res.resultXdr?.toXDR('base64') ?? '')}`,
      );
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(
    `Transaction ${hash} did not confirm within ${CONFIRM_TIMEOUT_MS / 1000}s. ` +
      'It may still succeed — check the explorer before retrying.',
  );
}

/** Reads a view function via simulation. Costs nothing and needs no signature. */
export async function readContract<T>(
  contractId: string,
  method: string,
  args: xdr.ScVal[] = [],
): Promise<T> {
  if (isMockRpc()) {
    recordMockCall({ kind: 'read', contractId, method }, recordArgs(args));
    return mockReadResult<T>(contractId, method, args);
  }

  const { BASE_FEE, Account, Contract, rpc, TransactionBuilder, scValToNative } =
    await loadSdk();
  const server = await getServer();

  const contract = new Contract(contractId);
  // A well-formed but unfunded account is enough to simulate a read.
  const dummy = new Account(
    'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    '0',
  );
  const tx = new TransactionBuilder(dummy, {
    fee: BASE_FEE,
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error);
  if (!sim.result?.retval) throw new Error(`${method} returned nothing`);
  return scValToNative(sim.result.retval) as T;
}

// ----- end-to-end test doubles (see e2e-seam.ts) -----

/** create_voucher returns the new id as u64; every other write returns nothing. */
/**
 * The arguments of a mocked call as base64 XDR, so Playwright can assert the
 * exact values a contract call carried — the `args` beside the recorded
 * calls in e2e-seam.ts.
 */
function recordArgs(args: xdr.ScVal[]): string[] {
  return args.map((a) => a.toXDR('base64'));
}

function mockReturnValue(method: string): unknown {
  if (method === 'create_voucher') return 7n;
  return null;
}

/**
 * Canned reads. quote charges no fee so the funding form shows a
 * deterministic "Clinic receives …" line; the registry reads put the mock
 * clinic and attester in their working states; the faucet reads give the
 * connected wallet a balance. Anything else throws so a missing double
 * fails loudly instead of rendering a confusing empty state.
 *
 * The SDK is loaded lazily even here: decoding the quote amount needs
 * `scValToNative`, but mock mode is test-only so the extra chunk is never
 * part of the production read-only bundle.
 */
async function mockReadResult<T>(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
): Promise<T> {
  const override = mockRpcRead(contractId, method);
  if (override !== undefined) return override as T;

  switch (method) {
    case 'get_admin':
      return '' as T;
    case 'quote': {
      const { scValToNative } = await loadSdk();
      const amount = scValToNative(args[0]) as bigint;
      return [0n, amount] as unknown as T;
    }
    case 'get_provider':
      return { status: 'Active' } as unknown as T;
    case 'is_attester':
    case 'is_active_provider':
      return true as unknown as T;
    case 'next_drip_at':
      return 0n as unknown as T;
    case 'get_config':
      return { amount: 500000000n } as unknown as T;
    case 'balance':
      return 100000000n as unknown as T;
    default:
      throw new Error(`E2E mock has no canned read for ${method}`);
  }
}

// ----- argument encoders -----
//
// Soroban is strict about numeric widths. Passing a JS number where the
// contract expects u64 or i128 produces a confusing XDR error, so each
// encoder below is explicit about its type.
//
// Async on purpose: encoding needs the SDK, and awaiting `import()` keeps
// the SDK in a separate chunk that read-only pages never download. Callers
// `await` each encoder before `invokeContract`/`readContract`.

export const arg = {
  address: async (v: string): Promise<xdr.ScVal> => {
    const { Address } = await loadSdk();
    return Address.fromString(v).toScVal();
  },
  u32: async (v: number): Promise<xdr.ScVal> => {
    const { nativeToScVal } = await loadSdk();
    return nativeToScVal(v, { type: 'u32' });
  },
  u64: async (v: bigint | number): Promise<xdr.ScVal> => {
    const { nativeToScVal } = await loadSdk();
    return nativeToScVal(BigInt(v), { type: 'u64' });
  },
  i128: async (v: bigint | string): Promise<xdr.ScVal> => {
    const { nativeToScVal } = await loadSdk();
    return nativeToScVal(BigInt(v), { type: 'i128' });
  },
  string: async (v: string): Promise<xdr.ScVal> => {
    const { nativeToScVal } = await loadSdk();
    return nativeToScVal(v, { type: 'string' });
  },
  symbol: async (v: string): Promise<xdr.ScVal> => {
    const { nativeToScVal } = await loadSdk();
    return nativeToScVal(v, { type: 'symbol' });
  },
  bytes32: async (hex: string): Promise<xdr.ScVal> => {
    const { xdr } = await loadSdk();
    const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
    if (!/^[0-9a-fA-F]{64}$/.test(clean)) {
      throw new Error('Beneficiary reference must be 64 hex characters');
    }
    return xdr.ScVal.scvBytes(Buffer.from(clean, 'hex'));
  },
  bool: async (v: boolean): Promise<xdr.ScVal> => {
    const { xdr } = await loadSdk();
    return xdr.ScVal.scvBool(v);
  },
};
