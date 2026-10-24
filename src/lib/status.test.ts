import { describe, expect, it } from 'vitest';

import { isReadyStatus, type ReadyStatus } from './api';
import {
  deploymentMismatches,
  describeLag,
  overallStatus,
  readinessProblems,
  shortCommit,
} from './status';

const READY: ReadyStatus = {
  status: 'ready',
  checks: { database: true, lagLedgers: 0, gapDetected: false },
};

describe('isReadyStatus', () => {
  it('accepts ready and degraded bodies', () => {
    expect(isReadyStatus(READY)).toBe(true);
    expect(isReadyStatus({ status: 'degraded', checks: {} })).toBe(true);
  });

  it('rejects anything else, such as a proxy error page', () => {
    expect(isReadyStatus(null)).toBe(false);
    expect(isReadyStatus({ error: 'bad_gateway' })).toBe(false);
    expect(isReadyStatus({ status: 'ok' })).toBe(false);
    expect(isReadyStatus({ status: 'ready' })).toBe(false);
  });
});

describe('overallStatus', () => {
  it('follows the readiness answer when there is one', () => {
    expect(overallStatus(READY, false)).toBe('operational');
    expect(overallStatus({ ...READY, status: 'degraded' }, false)).toBe('degraded');
    // A cached answer outlives a failed refresh.
    expect(overallStatus(READY, true)).toBe('operational');
  });

  it('is unreachable only without any answer', () => {
    expect(overallStatus(null, true)).toBe('unreachable');
    expect(overallStatus(null, false)).toBe('checking');
  });
});

describe('describeLag', () => {
  it('reads ledgers as approximate time', () => {
    expect(describeLag(undefined)).toBe('Not reported');
    expect(describeLag(0)).toBe('Up to date');
    expect(describeLag(1)).toBe('1 ledger behind (about 5s)');
    expect(describeLag(36)).toBe('36 ledgers behind (about 3 min)');
    expect(describeLag(1440)).toBe('1440 ledgers behind (about 2 h)');
  });
});

describe('readinessProblems', () => {
  it('is empty when every check passes', () => {
    expect(readinessProblems(READY)).toEqual([]);
  });

  it('names each failing check', () => {
    const problems = readinessProblems({
      status: 'degraded',
      checks: { database: false, lagLedgers: 12, gapDetected: true },
    });
    expect(problems).toHaveLength(3);
    expect(problems[0]).toMatch(/database/);
    expect(problems[1]).toMatch(/12 ledgers behind/);
    expect(problems[2]).toMatch(/gap/);
  });

  it('still explains a degraded answer with no failing check', () => {
    expect(readinessProblems({ status: 'degraded', checks: { database: true } })).toEqual([
      'The indexer reports itself degraded without naming a failing check.',
    ]);
  });
});

describe('deploymentMismatches', () => {
  const app = { network: 'testnet', contracts: { registry: 'CREG', voucher: 'CVOU' } };

  it('is empty when the deployments agree', () => {
    expect(
      deploymentMismatches(app, { network: 'testnet', contracts: { ...app.contracts, receipt: '', usdc: null, faucet: null } }),
    ).toEqual([]);
  });

  it('flags another network and another contract', () => {
    const out = deploymentMismatches(app, {
      network: 'public',
      contracts: { registry: 'CREG', voucher: 'COTHER', receipt: '', usdc: null, faucet: null },
    });
    expect(out).toEqual([
      'This app is built for testnet, but the API indexes public.',
      'The API indexes a different voucher contract than this app writes to.',
    ]);
  });
});

describe('shortCommit', () => {
  it('keeps seven characters', () => {
    expect(shortCommit('abc1234def5678')).toBe('abc1234');
    expect(shortCommit(null)).toBeNull();
    expect(shortCommit('')).toBeNull();
  });
});
