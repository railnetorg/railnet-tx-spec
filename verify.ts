/** Your own values, never read from a response: addresses from your registry, lowercase or EIP-55 checksummed. */
export type ApproveRequest = {
  conduit: string;
  token: string;
  /** Decimal string, in the smallest unit of `token`. */
  amount: string;
};

/** Your own values, never read from a response: addresses from your registry, lowercase or EIP-55 checksummed. */
export type DepositRequest = {
  conduit: string;
  vehicle: string;
  token: string;
  /** The account that signs: it receives the Conduit shares. */
  sender: string;
  /** Decimal string, in the smallest unit of `token`. */
  amount: string;
  /** Decimal string: the fewest Vehicle shares the deposit may yield. Your choice, not judged here. */
  minOutput: string;
  /** Your own 32 random bytes, always sent in the request: 0x and 64 lowercase hex digits. */
  salt: string;
};

/** Your own values, never read from a response: addresses from your registry, lowercase or EIP-55 checksummed. */
export type RedeemRequest = {
  conduit: string;
  token: string;
  /** The account that is paid: set it to the account that signs. */
  receiver: string;
  /** Decimal string, in Conduit shares. */
  shares: string;
  /** Decimal string: the least `token` the redeem may pay, before the Conduit's fees. Your choice, not judged here. */
  minOutput: string;
  /** Your own 32 random bytes, always sent in the request: 0x and 64 lowercase hex digits. */
  salt: string;
};

/** What to sign, never the response: lowercase hex, `value` in wei. The chain id, the nonce and the gas are yours. */
export type Transaction = { to: `0x${string}`; data: `0x${string}`; value: '0' };

/** Keccak-256, the Ethereum hash and not NIST SHA3-256: 0x-prefixed hex in and out, as in ethers and viem. */
export type Keccak256 = (data: `0x${string}`) => string;

type VerifyApproveArgs = { request: ApproveRequest; response: unknown };
type VerifyDepositArgs = { request: DepositRequest; response: unknown; keccak256: Keccak256 };
type VerifyRedeemArgs = { request: RedeemRequest; response: unknown };

const KECCAK256_OF_EMPTY_INPUT = '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470';

/**
 * `token.approve(conduit, amount)`
 * Throws when the request is malformed. Returns `null` when the response is not this call.
 */
export function verifyApprove({ request, response }: VerifyApproveArgs): Transaction | null {
  return compare(response, {
    to: `0x${addressHex(request.token, 'token')}`,
    data: calldata('095ea7b3', [addressHex(request.conduit, 'conduit'), uintHex(request.amount, 'amount')]),
    value: '0',
  });
}

/**
 * `conduit.create(query, sender, salt)`
 * Throws when the request or `keccak256` is wrong. Returns `null` when the response is not this call.
 */
export function verifyDeposit({ request, response, keccak256 }: VerifyDepositArgs): Transaction | null {
  if (keccak256('0x').toLowerCase() !== KECCAK256_OF_EMPTY_INPUT) throw new Error('keccak256: not Keccak-256');

  const conduit = addressHex(request.conduit, 'conduit');
  const sender = addressHex(request.sender, 'sender');
  const token = addressHex(request.token, 'token');
  const vehicle = addressHex(request.vehicle, 'vehicle');
  const salt = bytes32Hex(request.salt, 'salt');

  // With the Vehicle as input asset, `create` burns the sender's Conduit shares: a redeem, not a deposit.
  if (token === vehicle) throw new Error('token: must not be the vehicle');

  // The Conduit reverts unless `query.salt` is keccak256(abi.encode(msg.sender, sourceSalt)).
  const querySalt = bytes32Hex(keccak256(`0x${sender.padStart(64, '0')}${salt}`).toLowerCase(), 'keccak256 output');

  return compare(response, {
    to: `0x${conduit}`,
    data: calldata('50bb3af4', [
      '60', // where `query` starts: after these 3 words
      sender, // receiver
      salt, // sourceSalt
      conduit, // query.owner
      conduit, // query.receiver
      token, // query.input.asset
      uintHex(request.amount, 'amount'), // query.input.value
      vehicle, // query.output.asset
      uintHex(request.minOutput, 'minOutput'), // query.output.value
      '0', // query.mode: DEPOSIT
      querySalt, // query.salt
      '120', // where `query.data` starts inside `query`: after its 9 words
      '0', // length of `query.data`: empty
    ]),
    value: '0',
  });
}

/**
 * `conduit.createRedeemFromConduitShares(shares, (token, minOutput), salt, receiver)`
 * Throws when the request is malformed. Returns `null` when the response is not this call.
 */
export function verifyRedeem({ request, response }: VerifyRedeemArgs): Transaction | null {
  return compare(response, {
    to: `0x${addressHex(request.conduit, 'conduit')}`,
    data: calldata('4c717f8d', [
      uintHex(request.shares, 'shares'),
      addressHex(request.token, 'token'),
      uintHex(request.minOutput, 'minOutput'),
      bytes32Hex(request.salt, 'salt'),
      addressHex(request.receiver, 'receiver'),
    ]),
    value: '0',
  });
}

function compare(response: unknown, rebuilt: Transaction): Transaction | null {
  if (typeof response !== 'object' || response === null) return null;
  const { to, data, value } = response as Record<string, unknown>;
  if (typeof to !== 'string' || typeof data !== 'string') return null;
  const same = to.toLowerCase() === rebuilt.to && data.toLowerCase() === rebuilt.data && value === rebuilt.value;
  return same ? rebuilt : null;
}

/** 0x, the 4-byte selector, then each value left-padded to a 32-byte word. */
function calldata(selector: string, values: string[]): `0x${string}` {
  return `0x${selector}${values.map((value) => value.padStart(64, '0')).join('')}`;
}

function uintHex(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new Error(`${field}: not a decimal string`);
  const hex = BigInt(value).toString(16);
  if (hex.length > 64) throw new Error(`${field}: above uint256`);
  return hex;
}

function addressHex(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`${field}: not 0x and 40 hex digits`);
  }
  return value.slice(2).toLowerCase();
}

function bytes32Hex(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${field}: not 0x and 64 lowercase hex digits`);
  }
  return value.slice(2);
}
