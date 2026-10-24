/**
 * Test-only seam for Playwright end-to-end tests.
 *
 * When the page sets `window.__SCI_MOCK_WALLET__` (an address, no keys) the
 * wallet provider reports that address and its signer echoes the unsigned
 * transaction back. When `window.__SCI_MOCK_RPC__` is present, contract
 * reads and writes short-circuit: calls are recorded for assertions and
 * canned `{ hash, returnValue }` values are returned without touching
 * Soroban RPC.
 *
 * Neither global is ever set outside tests, so production behaviour is
 * unchanged. The mock holds no secret keys and cannot move real funds: with
 * no RPC mock in place the echoed (unsigned) transaction would simply be
 * rejected by the network.
 */

export type MockRpcCall = {
  /** `change_trust` is the classic USDC trustline operation (#1), not a
   *  contract call: `contractId` is the USDC contract the line backs. */
  kind: 'invoke' | 'read' | 'change_trust';
  contractId: string;
  method: string;
};

declare global {
  interface Window {
    __SCI_MOCK_WALLET__?: { address: string };
    /**
     * Simulates the wallet submitting a SEP-7 transaction (#162). Until it is
     * set the poller keeps waiting; once present the funding panel reports
     * the hash and moves to its success state.
     */
    __SCI_MOCK_SEP7__?: { hash: string };
    __SCI_MOCK_RPC__?: {
      calls: MockRpcCall[];
      /**
       * Arguments of each recorded call, as base64 XDR, index-aligned with
       * `calls`. Kept beside them rather than on them so a test asserting the
       * calls it expects does not have to know their arguments.
       */
      args: string[][];
      delayMs?: number;
      reads?: Record<string, unknown>;
    };
    /** Playwright: the mock wallet has no USDC trustline yet (#1). */
    __SCI_NO_TRUSTLINE__?: boolean;
    /** Playwright: the mock wallet refuses to sign, as a real one can (#1). */
    __SCI_MOCK_SIGN_REJECT__?: boolean;
  }
}

/** Address injected by Playwright, or null in normal use. */
export function mockWalletAddress(): string | null {
  if (typeof window === 'undefined') return null;
  return window.__SCI_MOCK_WALLET__?.address ?? null;
}

/** True once Playwright has installed the RPC mock for this page. */
export function isMockRpc(): boolean {
  return typeof window !== 'undefined' && Boolean(window.__SCI_MOCK_RPC__);
}

export function recordMockCall(call: MockRpcCall, args: string[] = []): void {
  const mock = window.__SCI_MOCK_RPC__;
  if (!mock) return;
  mock.calls.push(call);
  mock.args.push(args);
}

/** True once Playwright has made the mock wallet refuse to sign (#1). */
export function mockSignRejects(): boolean {
  return typeof window !== 'undefined' && Boolean(window.__SCI_MOCK_SIGN_REJECT__);
}

/**
 * How long a mock write should stay in flight, in milliseconds. Lets a test
 * hold a transaction pending long enough to observe the unload guard.
 */
export function mockRpcDelayMs(): number {
  if (typeof window === 'undefined') return 0;
  const delay = window.__SCI_MOCK_RPC__?.delayMs ?? 0;
  return Number.isFinite(delay) && delay > 0 ? delay : 0;
}

export function mockRpcRead(contractId: string, method: string): unknown {
  return window.__SCI_MOCK_RPC__?.reads?.[`${contractId}:${method}`];
}

/**
 * The mock SEP-7 submission, or null while the "wallet" has not submitted.
 * Set by a Playwright test with `page.evaluate`.
 */
export function mockSep7Submission(): { hash: string } | null {
  if (typeof window === 'undefined') return null;
  const value = window.__SCI_MOCK_SEP7__;
  return value?.hash ? { hash: value.hash } : null;
}
