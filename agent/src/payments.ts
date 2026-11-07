const HORIZON_URL = process.env.HORIZON_URL ?? 'https://horizon-testnet.stellar.org';
const USDC_CODE = 'USDC';
const USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

interface HorizonOperation {
  type?: string;
  to?: string;
  amount?: string;
  asset_code?: string;
  asset_issuer?: string;
  transaction_successful?: boolean;
}

/**
 * Looks up a payment on the network and returns its amount in stroops, or null
 * unless it is a successful USDC payment to `recipient`.
 */
export async function verifyIncomingPayment(
  paymentId: string,
  recipient: string,
): Promise<number | null> {
  if (!/^\d+$/.test(paymentId)) return null;

  const res = await fetch(`${HORIZON_URL}/operations/${paymentId}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Horizon returned ${res.status} for payment ${paymentId}`);

  const op = (await res.json()) as HorizonOperation;
  if (
    op.type !== 'payment' ||
    op.to !== recipient ||
    op.asset_code !== USDC_CODE ||
    op.asset_issuer !== USDC_ISSUER ||
    op.transaction_successful !== true ||
    !op.amount
  ) {
    return null;
  }

  const [whole, frac = ''] = op.amount.split('.');
  return Number(BigInt(whole) * 10_000_000n + BigInt(frac.padEnd(7, '0').slice(0, 7)));
}
