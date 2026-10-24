/**
 * Fixtures for end-to-end flow tests.
 *
 * The three roles are deterministic Stellar addresses (valid checksums from
 * fixed seeds) so `Address.fromString` accepts them in the contract-arg
 * encoders. Dates are fixed; the clock is not frozen here because no
 * assertion depends on relative time — voucher states are chosen so no
 * countdown renders (settleable/refundable flags are explicit).
 */

import { createHmac } from 'node:crypto';

// Seed 0x01… — funds vouchers, disputes, refunds.
export const FUNDER =
  'GCFIRY65OQE7DFP5KLNS2PF2LVZMUZYJX4OZIEQ36N2IQANUB5XVYOJR';
// Seed 0x02… — runs the clinic desk, receives vouchers.
export const PROVIDER =
  'GCATS5YOVB6ROX2WUNKGNQ2MP3GMXDMKSG2O4N5CLX3A6W4PZGZZI55U';
// Seed 0x03… — confirms delivery on /attest.
export const ATTESTER =
  'GDWUSKGGFDI4FRXK5EBTRECZSVQSSWJHHJOGH6JWG3AUMFFMQ435DIAG';

/**
 * The patient details behind every fixture voucher's `beneficiaryRef`.
 * The app derives the same digest with WebCrypto before claiming (#33), so
 * a test can type these into the verify panel and see a match.
 */
export const PATIENT_IDENTIFIER = 'CARD-123';
export const PATIENT_KEY = 'clinic-verify-test-key-0123456789abcdef';
export const PATIENT_REF = createHmac('sha256', PATIENT_KEY)
  .update(PATIENT_IDENTIFIER.toLowerCase())
  .digest('hex');

const SERVICES = [
  {
    code: 101,
    label: 'Outpatient consult',
    price: '30000000',
    priceDisplay: '3.00',
    active: true,
  },
  {
    code: 102,
    label: 'Malaria test',
    price: '50000000',
    priceDisplay: '5.00',
    active: true,
  },
];

/** Service catalogue items returned by `GET /services`. */
export const SERVICE_CATALOGUE = [
  {
    code: 101,
    labels: ['Outpatient consult'],
    clinicCount: 2,
    minPrice: '30000000',
    maxPrice: '45000000',
    medianPrice: '37500000',
    minPriceDisplay: '3.00',
    maxPriceDisplay: '4.50',
    medianPriceDisplay: '3.75',
    providers: [
      {
        address: PROVIDER,
        name: 'Ikeja General Clinic',
        country: 'NG',
        price: '30000000',
        priceDisplay: '3.00',
      },
      {
        address: ATTESTER,
        name: 'Lekki Care Centre',
        country: 'NG',
        price: '45000000',
        priceDisplay: '4.50',
      },
    ],
  },
  {
    code: 102,
    labels: ['Malaria test'],
    clinicCount: 1,
    minPrice: '50000000',
    maxPrice: '50000000',
    medianPrice: '50000000',
    minPriceDisplay: '5.00',
    maxPriceDisplay: '5.00',
    medianPriceDisplay: '5.00',
    providers: [
      {
        address: PROVIDER,
        name: 'Ikeja General Clinic',
        country: 'NG',
        price: '50000000',
        priceDisplay: '5.00',
      },
    ],
  },
];

/** `GET /services/:code` lookup keyed by code string. */
export const SERVICE_BY_CODE: Record<string, (typeof SERVICE_CATALOGUE)[number]> = {
  '101': SERVICE_CATALOGUE[0],
  '102': SERVICE_CATALOGUE[1],
};

export const CLINIC = {
  address: PROVIDER,
  name: 'Ikeja General Clinic',
  country: 'NG',
  status: 'Active',
  registeredAt: '2026-04-01T00:00:00.000Z',
  services: SERVICES,
};

/** Same clinic, with coordinates published in its metadata (map view). */
export const LOCATED_CLINIC = {
  ...CLINIC,
  location: { lat: 6.6018, lng: 3.3515 },
};

/** A second clinic that has not published a location. */
export const UNLOCATED_CLINIC = {
  ...CLINIC,
  address: ATTESTER,
  name: 'Lekki Care Centre',
  services: SERVICES.slice(0, 1),
};

function baseVoucher(id: string, overrides: Record<string, unknown>) {
  return {
    id,
    funder: FUNDER,
    beneficiaryRef: PATIENT_REF,
    provider: { address: PROVIDER, name: 'Ikeja General Clinic', country: 'NG' },
    serviceCode: 101,
    serviceLabel: 'Outpatient consult',
    amount: '30000000',
    amountDisplay: '3.00',
    createdAt: '2026-05-20T10:00:00.000Z',
    expiresAt: '2026-06-19T10:00:00.000Z',
    claimedAt: null,
    attestedAt: null,
    disputeDeadline: null,
    settledNet: null,
    settledFee: null,
    disputeReason: null,
    refundableAt: null,
    isSettleable: false,
    isRefundable: false,
    receipt: null,
    ...overrides,
  };
}

/** Freshly funded: the clinic can claim it. */
export const FUNDED_VOUCHER = (id: string) =>
  baseVoucher(id, { status: 'Funded' });

/** Claimed by the clinic, waiting on an attester. */
export const CLAIMED_VOUCHER = (id: string) =>
  baseVoucher(id, {
    status: 'Claimed',
    claimedAt: '2026-05-22T10:00:00.000Z',
    refundableAt: '2026-07-01T00:00:00.000Z',
  });

/** Expired and unclaimed: the funder can take it back. */
export const REFUNDABLE_VOUCHER = (id: string) =>
  baseVoucher(id, {
    status: 'Funded',
    expiresAt: '2026-05-01T10:00:00.000Z',
    isRefundable: true,
  });
