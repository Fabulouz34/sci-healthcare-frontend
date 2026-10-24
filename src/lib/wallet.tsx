'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { config } from './config';
import { mockWalletAddress } from './e2e-seam';
import {
  PASSKEY_WALLET_ID,
  PasskeyModule,
  connectPasskeyWallet,
  getStoredPasskeyAddress,
  signWithPasskey,
} from './passkey';
import { checkAccountFunded, getAccountSpendableBalance } from './stellar';
import {
  WALLET_CONNECT_WALLET_ID,
  isWalletConnectConfigured,
  walletConnectChainId,
  walletConnectMetadata,
} from './wallet-connect';

/**
 * Wallet connection.
 *
 * The app is non-custodial: it never sees a secret key. Every state change
 * is signed inside the user's wallet and submitted from the browser
 * straight to Soroban RPC. The backend is not in the write path at all.
 *
 * The wallet kit (~large) is split out of the initial bundle: read-only
 * pages never download it. It loads on demand the first time the user
 * connects, restores a previous session, or signs. A `sci-wallet-connected`
 * flag in local storage avoids even the restore attempt on a first visit.
 *
 * StellarWalletsKit v2 exposes a static, process-wide API rather than an
 * instance, so initialisation is guarded to run exactly once.
 */

export type WalletState = {
  address: string | null;
  walletName: string | null;
  connecting: boolean;
  isUnfunded: boolean;
  isLowXlm: boolean;
  spendableXlm: number | null;
  error: string | null;
  networkMismatch: boolean;
  connect: (walletId?: string) => Promise<void>;
  disconnect: () => Promise<void>;
  signTransaction: (xdr: string) => Promise<string>;
};

const WalletContext = createContext<WalletState | null>(null);

const CONNECTED_FLAG = 'sci-wallet-connected';
const SELECTED_WALLET_ID_KEY = 'sci-wallet-id';

let initialised = false;
let initPromise: Promise<void> | null = null;

function getWalletDisplayName(id: string | null | undefined): string {
  if (!id) return 'Connected Wallet';
  if (id === PASSKEY_WALLET_ID) return 'Passkey Smart Wallet';
  if (id === WALLET_CONNECT_WALLET_ID) return 'WalletConnect';
  if (/freighter/i.test(id)) return 'Freighter';
  if (/xbull/i.test(id)) return 'xBull Wallet';
  if (/albedo/i.test(id)) return 'Albedo';
  if (/lobstr/i.test(id)) return 'LOBSTR';
  if (/rabet/i.test(id)) return 'Rabet';
  if (/hana/i.test(id)) return 'Hana Wallet';
  return id;
}

function getNetworkName(passphrase: string): string {
  if (passphrase === 'Public Global Stellar Network ; September 2015') {
    return 'Public network';
  }
  if (passphrase === 'Test SDF Network ; September 2015') return 'Testnet';
  if (passphrase === 'Test SDF Future Network ; October 2022') return 'Futurenet';
  return passphrase;
}

/** Loads the kit and initialises it exactly once. */
function ensureInit(): Promise<void> {
  if (initialised) return Promise.resolve();
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const [
      { StellarWalletsKit, Networks },
      { FREIGHTER_ID },
      { defaultModules },
    ] = await Promise.all([
      import('@creit.tech/stellar-wallets-kit'),
      import('@creit.tech/stellar-wallets-kit/modules/freighter'),
      import('@creit.tech/stellar-wallets-kit/modules/utils'),
    ]);
    const network =
      config.network === 'public'
        ? Networks.PUBLIC
        : config.network === 'futurenet'
          ? Networks.FUTURENET
          : Networks.TESTNET;

    // Passkey and the extension wallets that need no configuration. The
    // WalletConnect module is added below only when a project id is set, so
    // deployments that do not want mobile wallets keep the small bundle.
    const modules: import('@creit.tech/stellar-wallets-kit').ModuleInterface[] = [
      new PasskeyModule() as unknown as import('@creit.tech/stellar-wallets-kit').ModuleInterface,
      ...defaultModules(),
    ];

    if (isWalletConnectConfigured()) {
      try {
        const { WalletConnectModule, WalletConnectTargetChain } = await import(
          '@creit.tech/stellar-wallets-kit/modules/wallet-connect'
        );
        const chain = walletConnectChainId(config.network);
        const origin =
          typeof window !== 'undefined'
            ? window.location.origin
            : 'https://sci-healthcare.vercel.app';
        modules.push(
          new WalletConnectModule({
            projectId: config.walletConnectProjectId.trim(),
            metadata: walletConnectMetadata(origin),
            allowedChains: [
              chain === 'stellar:pubnet'
                ? WalletConnectTargetChain.PUBLIC
                : WalletConnectTargetChain.TESTNET,
            ],
          }) as unknown as import('@creit.tech/stellar-wallets-kit').ModuleInterface,
        );
      } catch {
        // A bad project id or a blocked AppKit bundle must not take the
        // extension and passkey wallets down with it.
      }
    }

    StellarWalletsKit.init({
      modules,
      selectedWalletId: FREIGHTER_ID,
      network,
    });
    initialised = true;
  })();
  return initPromise;
}

async function getKit() {
  await ensureInit();
  const { StellarWalletsKit } = await import('@creit.tech/stellar-wallets-kit');
  return StellarWalletsKit;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [isUnfunded, setIsUnfunded] = useState(false);
  const [isLowXlm, setIsLowXlm] = useState(false);
  const [spendableXlm, setSpendableXlm] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [walletNetworkName, setWalletNetworkName] = useState<string | null>(null);
  const [networkMismatch, setNetworkMismatch] = useState(false);

  // Restore a previous session silently (#59).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mocked = mockWalletAddress();
      if (mocked) {
        if (!cancelled) {
          setAddress(mocked);
          setWalletName('Mock Wallet');
        }
        return;
      }
      try {
        if (
          typeof window !== 'undefined' &&
          window.localStorage.getItem(CONNECTED_FLAG) !== '1'
        ) {
          return;
        }
      } catch {
        return;
      }

      const savedWalletId = (() => {
        try {
          return window.localStorage.getItem(SELECTED_WALLET_ID_KEY);
        } catch {
          return null;
        }
      })();

      if (savedWalletId === PASSKEY_WALLET_ID) {
        const passkeyAddr = getStoredPasskeyAddress();
        if (!cancelled && passkeyAddr) {
          setAddress(passkeyAddr);
          setWalletName('Passkey Smart Wallet');
        }
        return;
      }

      try {
        const kit = await getKit();
        if (savedWalletId) {
          kit.setWallet(savedWalletId);
        }
        const { address: addr } = await kit.getAddress();
        if (!cancelled && addr) {
          setAddress(addr);
          setWalletName(
            getWalletDisplayName(savedWalletId || kit.selectedModule?.productId),
          );
        }
      } catch {
        // Not connected yet or wallet locked.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!address) return;

    let cancelled = false;
    let latestCheck = 0;
    const checkNetwork = async () => {
      const check = ++latestCheck;
      const clearNetwork = () => {
        if (!cancelled && check === latestCheck) {
          setWalletNetworkName(null);
          setNetworkMismatch(false);
        }
      };

      if (mockWalletAddress() || walletName === 'Passkey Smart Wallet') {
        clearNetwork();
        return;
      }

      try {
        const savedWalletId = window.localStorage.getItem(SELECTED_WALLET_ID_KEY);
        if (savedWalletId === PASSKEY_WALLET_ID) {
          clearNetwork();
          return;
        }
        const kit = await getKit();
        const { networkPassphrase } = await kit.getNetwork();
        if (typeof networkPassphrase !== 'string' || !networkPassphrase) {
          clearNetwork();
          return;
        }
        if (!cancelled && check === latestCheck) {
          setWalletNetworkName(getNetworkName(networkPassphrase));
          setNetworkMismatch(networkPassphrase !== config.networkPassphrase);
        }
      } catch {
        clearNetwork();
      }
    };

    void checkNetwork();
    window.addEventListener('focus', checkNetwork);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', checkNetwork);
    };
  }, [address, walletName]);

  // Check if connected account exists on network (#60) and has enough XLM for fees (#61).
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    (async () => {
      try {
        const [funded, spendableInfo] = await Promise.all([
          checkAccountFunded(address),
          getAccountSpendableBalance(address),
        ]);
        if (!cancelled) {
          setIsUnfunded(!funded);
          if (spendableInfo) {
            setIsLowXlm(spendableInfo.isLowForFees);
            setSpendableXlm(spendableInfo.spendable);
          } else {
            setIsLowXlm(false);
            setSpendableXlm(null);
          }
        }
      } catch {
        if (!cancelled) {
          setIsUnfunded(false);
          setIsLowXlm(false);
          setSpendableXlm(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  const connect = useCallback(async (walletId?: string) => {
    const mocked = mockWalletAddress();
    if (mocked) {
      setAddress(mocked);
      setWalletName('Mock Wallet');
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      let addr: string | null = null;
      let selectedId: string | null = null;

      if (walletId === PASSKEY_WALLET_ID) {
        const passkey = await connectPasskeyWallet();
        addr = passkey.address;
        selectedId = PASSKEY_WALLET_ID;
      } else {
        const kit = await getKit();
        if (walletId) {
          kit.setWallet(walletId);
          const res = await kit.getAddress();
          addr = res.address;
          selectedId = walletId;
        } else {
          const res = await kit.authModal();
          addr = res.address;
          selectedId = kit.selectedModule?.productId || null;
        }
      }

      setAddress(addr);
      setWalletName(getWalletDisplayName(selectedId));

      try {
        window.localStorage.setItem(CONNECTED_FLAG, '1');
        if (selectedId) {
          window.localStorage.setItem(SELECTED_WALLET_ID_KEY, selectedId);
        }
      } catch {
        // Storage may be unavailable
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!/closed|cancel/i.test(message)) setError(message);
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      if (typeof window !== 'undefined') {
        delete (window as unknown as { __SCI_MOCK_WALLET__?: unknown }).__SCI_MOCK_WALLET__;
      }
      try {
        const kit = await getKit();
        await kit.disconnect();
      } catch {
        // The kit may never have loaded
      }
      try {
        window.localStorage.removeItem(CONNECTED_FLAG);
        window.localStorage.removeItem(SELECTED_WALLET_ID_KEY);
      } catch {
        // Ignore storage failures
      }
    } finally {
      setAddress(null);
      setWalletName(null);
      setIsUnfunded(false);
      setIsLowXlm(false);
      setSpendableXlm(null);
      setWalletNetworkName(null);
      setNetworkMismatch(false);
    }
  }, []);

  const signTransaction = useCallback(
    async (xdr: string) => {
      if (!address) throw new Error('Connect a wallet first');
      if (networkMismatch) throw new Error('Switch your wallet to the app network before signing');
      if (mockWalletAddress()) return xdr;

      const savedWalletId = (() => {
        try {
          return window.localStorage.getItem(SELECTED_WALLET_ID_KEY);
        } catch {
          return null;
        }
      })();

      if (savedWalletId === PASSKEY_WALLET_ID || address.startsWith('C')) {
        return signWithPasskey(xdr);
      }

      const kit = await getKit();
      const { signedTxXdr } = await kit.signTransaction(xdr, {
        address,
        networkPassphrase: config.networkPassphrase,
      });
      return signedTxXdr;
    },
    [address, networkMismatch],
  );

  const value = useMemo(
    () => ({
      address,
      walletName,
      connecting,
      isUnfunded,
      isLowXlm,
      spendableXlm,
      error,
      networkMismatch,
      connect,
      disconnect,
      signTransaction,
    }),
    [
      address,
      walletName,
      connecting,
      isUnfunded,
      isLowXlm,
      spendableXlm,
      error,
      networkMismatch,
      connect,
      disconnect,
      signTransaction,
    ],
  );

  return (
    <WalletContext.Provider value={value}>
      {networkMismatch && (
        <div
          role="alert"
          className="fixed inset-x-0 top-0 z-[100] border-b border-amber-500 bg-amber-50 px-4 py-3 text-center text-sm font-medium text-amber-950"
        >
          Wallet network mismatch: {walletNetworkName} is selected, but this app
          uses {getNetworkName(config.networkPassphrase)}. Switch your wallet
          network to continue.
        </div>
      )}
      <div inert={networkMismatch} style={{ display: 'contents' }}>
        {children}
      </div>
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used inside a WalletProvider');
  return ctx;
}
