import { expect, test } from 'bun:test'
import vectors from '../vectors.json'
import { type ApproveRequest, type DepositRequest, type RedeemRequest, type Transaction, verifyApprove, verifyDeposit, verifyRedeem } from '../verify.ts'
import { keccak256 } from './keccak256.ts'

const checkApprove = (request: ApproveRequest, response: unknown) => verifyApprove({ request, response })
const checkDeposit = (request: DepositRequest, response: unknown) => verifyDeposit({ request, response, keccak256 })
const checkRedeem = (request: RedeemRequest, response: unknown) => verifyRedeem({ request, response })

const CONDUIT = '0x6b2bc4d0614d7744dc5f71b7a2555a9cef2535d9'
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
const VEHICLE = '0xce532ed9019010657840a1484895ec00d5693a48'
const OTHER = '0x1111111111111111111111111111111111111111'
const OTHER_SALT = '0x1111111111111111111111111111111111111111111111111111111111111111'
const PAD_CONDUIT = '0000000000000000000000006b2bc4d0614d7744dc5f71b7a2555a9cef2535d9'

const approveRequest: ApproveRequest = { conduit: CONDUIT, token: USDC, amount: '1000000' }
const approveTx: Transaction = {
  to: USDC,
  data: `0x095ea7b3${PAD_CONDUIT}00000000000000000000000000000000000000000000000000000000000f4240`,
  value: '0',
}

const depositRequest: DepositRequest = {
  conduit: CONDUIT,
  vehicle: VEHICLE,
  token: USDC,
  sender: '0xde6308e382dca8b725bc66a0575304840e08d9a8',
  amount: '1000000',
  minOutput: '833746125109265740',
  salt: '0xfd998ee5f4a1caddeefa25ce83121601e5326a0c70fe6601c3a95f71a67770c4',
}
const depositTx: Transaction = {
  to: CONDUIT,
  data: '0x50bb3af40000000000000000000000000000000000000000000000000000000000000060000000000000000000000000de6308e382dca8b725bc66a0575304840e08d9a8fd998ee5f4a1caddeefa25ce83121601e5326a0c70fe6601c3a95f71a67770c40000000000000000000000006b2bc4d0614d7744dc5f71b7a2555a9cef2535d90000000000000000000000006b2bc4d0614d7744dc5f71b7a2555a9cef2535d9000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800000000000000000000000000000000000000000000000000000000000f4240000000000000000000000000ce532ed9019010657840a1484895ec00d5693a480000000000000000000000000000000000000000000000000b920faef3ff054c0000000000000000000000000000000000000000000000000000000000000000a33d32c6331dd73760fa94e36f17cb757dd0f74cfac71e8386176cff485b2b7700000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000000',
  value: '0',
}

const redeemRequest: RedeemRequest = {
  conduit: CONDUIT,
  token: USDC,
  receiver: '0xfe2f597f40da9c6abf6dea0b9cefe376a6117c7a',
  shares: '498798408652837363',
  minOutput: '498008',
  salt: '0x1483afb0a95e65f56386f4fb6de2d64f3802d6382a5ebec628c6ef544c070035',
}
const redeemTx: Transaction = {
  to: CONDUIT,
  data: '0x4c717f8d00000000000000000000000000000000000000000000000006ec16828a4851f3000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800000000000000000000000000000000000000000000000000000000000799581483afb0a95e65f56386f4fb6de2d64f3802d6382a5ebec628c6ef544c070035000000000000000000000000fe2f597f40da9c6abf6dea0b9cefe376a6117c7a',
  value: '0',
}

function survivingMutations(data: string, verify: (data: string) => unknown): number[] {
  const surviving: number[] = []
  for (let index = 2; index < data.length; index++) {
    const nibble = data[index] === '0' ? '1' : '0'
    if (verify(`${data.slice(0, index)}${nibble}${data.slice(index + 1)}`)) surviving.push(index)
  }
  return surviving
}

function survivingFields<Request extends Record<string, string>>(request: Request, changes: Request, verify: (request: Request) => unknown): string[] {
  const surviving: string[] = []
  for (const field of Object.keys(changes)) {
    if (verify({ ...request, [field]: changes[field] })) surviving.push(field)
  }
  return surviving
}

test('verifyDeposit accepts the input of mainnet deposit 0xd09f…cb7b (SPEC section 6), so a correct answer is never refused', () => {
  expect(checkDeposit(depositRequest, depositTx)).toStrictEqual(depositTx)
})

test('verifyRedeem accepts the input of mainnet redeem 0xfa57…e5f0 (SPEC section 6), so a correct answer is never refused', () => {
  expect(checkRedeem(redeemRequest, redeemTx)).toStrictEqual(redeemTx)
})

test('verifyApprove accepts the approve of SPEC section 6, and a reset to 0 when 0 is what was asked, so the USDT reset stays the caller’s decision', () => {
  expect(checkApprove(approveRequest, approveTx)).toStrictEqual(approveTx)
  const reset: Transaction = { ...approveTx, data: `0x095ea7b3${PAD_CONDUIT}${'0'.repeat(64)}` }
  expect(checkApprove({ ...approveRequest, amount: '0' }, reset)).toStrictEqual(reset)
})

test('an EIP-55 address and uppercase hex are the same bytes, so a service that echoes the caller’s casing is not refused and the transaction returned is lowercase all the same', () => {
  const checksummed = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
  expect(checkApprove({ ...approveRequest, token: checksummed }, { ...approveTx, to: checksummed })).toStrictEqual(approveTx)
  expect(checkApprove(approveRequest, { ...approveTx, data: `0x${approveTx.data.slice(2).toUpperCase()}` })).toStrictEqual(approveTx)
})

test('the transaction returned is rebuilt from the request, so a field the response adds never reaches the signer', () => {
  const response = { ...depositTx, gas: '1', maxFeePerGas: '1000000000000', nonce: 0, chainId: 5, salt: depositRequest.salt }
  const rebuilt = checkDeposit(depositRequest, response)
  expect(rebuilt).toStrictEqual(depositTx)
  expect(rebuilt).not.toBe(response)
})

test('changing any single hex digit of data is refused, so no byte of an answer goes unchecked', () => {
  expect(survivingMutations(depositTx.data, (data) => checkDeposit(depositRequest, { ...depositTx, data }))).toEqual([])
  expect(survivingMutations(redeemTx.data, (data) => checkRedeem(redeemRequest, { ...redeemTx, data }))).toEqual([])
  expect(survivingMutations(approveTx.data, (data) => checkApprove(approveRequest, { ...approveTx, data }))).toEqual([])
})

test('data with one byte more or one byte less is refused, so nothing can ride after the arguments', () => {
  expect(checkDeposit(depositRequest, { ...depositTx, data: `${depositTx.data}00` })).toBeNull()
  expect(checkRedeem(redeemRequest, { ...redeemTx, data: `${redeemTx.data}00` })).toBeNull()
  expect(checkApprove(approveRequest, { ...approveTx, data: `${approveTx.data}00` })).toBeNull()
  expect(checkDeposit(depositRequest, { ...depositTx, data: depositTx.data.slice(0, -2) })).toBeNull()
})

test('another destination is refused, so valid calldata cannot be pointed at another contract', () => {
  expect(checkDeposit(depositRequest, { ...depositTx, to: OTHER })).toBeNull()
  expect(checkRedeem(redeemRequest, { ...redeemTx, to: OTHER })).toBeNull()
  expect(checkApprove(approveRequest, { ...approveTx, to: CONDUIT })).toBeNull()
})

test('a value that is not the string "0" is refused, so no ETH leaves with the call', () => {
  expect(checkDeposit(depositRequest, { ...depositTx, value: '1' })).toBeNull()
  expect(checkRedeem(redeemRequest, { ...redeemTx, value: '0x0' })).toBeNull()
  expect(checkApprove(approveRequest, { ...approveTx, value: 0 })).toBeNull()
  expect(checkApprove(approveRequest, { to: approveTx.to, data: approveTx.data })).toBeNull()
})

test('every request field is bound to the answer, so an answer built for another request is refused', () => {
  expect(
    survivingFields(
      depositRequest,
      { conduit: OTHER, vehicle: OTHER, token: OTHER, sender: OTHER, amount: '1000001', minOutput: '833746125109265739', salt: OTHER_SALT },
      (request) => checkDeposit(request, depositTx),
    ),
  ).toEqual([])
  expect(
    survivingFields(
      redeemRequest,
      { conduit: OTHER, token: OTHER, receiver: OTHER, shares: '498798408652837364', minOutput: '498007', salt: OTHER_SALT },
      (request) => checkRedeem(request, redeemTx),
    ),
  ).toEqual([])
  expect(survivingFields(approveRequest, { conduit: OTHER, token: OTHER, amount: '1000001' }, (request) => checkApprove(request, approveTx))).toEqual([])
})

test('an amount that is not a decimal uint256 string throws and names its field even when BigInt would read it, so a malformed request is never mistaken for a wrong answer', () => {
  const approveOf = (amountWord: string) => ({ ...approveTx, data: `0x095ea7b3${PAD_CONDUIT}${amountWord}` })
  const notDecimal = 'amount: not a decimal string'
  expect(() => checkApprove({ ...approveRequest, amount: '' }, approveOf('0'.repeat(64)))).toThrow(notDecimal)
  expect(() => checkApprove({ ...approveRequest, amount: '0x10' }, approveOf(`${'0'.repeat(62)}10`))).toThrow(notDecimal)
  expect(() => checkApprove({ ...approveRequest, amount: ' 12 ' }, approveOf(`${'0'.repeat(62)}0c`))).toThrow(notDecimal)
  expect(() => checkApprove({ ...approveRequest, amount: '12\n' }, approveOf(`${'0'.repeat(62)}0c`))).toThrow(notDecimal)
  expect(() => checkApprove({ ...approveRequest, amount: '+12' }, approveOf(`${'0'.repeat(62)}0c`))).toThrow(notDecimal)
  expect(() => checkApprove({ ...approveRequest, amount: 1000000 as unknown as string }, approveTx)).toThrow(notDecimal)
  expect(() => checkRedeem({ ...redeemRequest, shares: '1e3' }, redeemTx)).toThrow('shares: not a decimal string')
  expect(() => checkDeposit({ ...depositRequest, minOutput: '-1' }, depositTx)).toThrow('minOutput: not a decimal string')
  expect(() =>
    checkApprove(
      { ...approveRequest, amount: '115792089237316195423570985008687907853269984665640564039457584007913129639936' },
      approveOf(`1${'0'.repeat(64)}`),
    ),
  ).toThrow('amount: above uint256')
})

test('an address of 39 hex digits and a salt of 31 bytes throw, so a short value is never padded into another one', () => {
  expect(() =>
    checkApprove(
      { ...approveRequest, conduit: '0x6b2bc4d0614d7744dc5f71b7a2555a9cef2535d' },
      { ...approveTx, data: `0x095ea7b300000000000000000000000006b2bc4d0614d7744dc5f71b7a2555a9cef2535d00000000000000000000000000000000000000000000000000000000000f4240` },
    ),
  ).toThrow('conduit: not 0x and 40 hex digits')
  const shortSalt = '0x1483afb0a95e65f56386f4fb6de2d64f3802d6382a5ebec628c6ef544c0700'
  const notSalt = 'salt: not 0x and 64 lowercase hex digits'
  expect(() => checkRedeem({ ...redeemRequest, salt: shortSalt }, { ...redeemTx, data: redeemTx.data.replace(redeemRequest.salt.slice(2), shortSalt.slice(2)) })).toThrow(notSalt)
  expect(() => checkRedeem({ ...redeemRequest, salt: shortSalt }, { ...redeemTx, data: redeemTx.data.replace(redeemRequest.salt.slice(2), `00${shortSalt.slice(2)}`) })).toThrow(notSalt)
})

test('an address or a salt that is too long, prefixed, not hex, in uppercase or not a string throws and names its field, so nothing but the exact format reaches the calldata', () => {
  const spender = (word: string) => ({ ...approveTx, data: `0x095ea7b3${word}00000000000000000000000000000000000000000000000000000000000f4240` })
  const hex = CONDUIT.slice(2)
  const notAddress = 'conduit: not 0x and 40 hex digits'
  expect(() => checkApprove({ ...approveRequest, conduit: `${CONDUIT}a` }, spender(`${'0'.repeat(23)}${hex}a`))).toThrow(notAddress)
  expect(() => checkApprove({ ...approveRequest, conduit: ` ${CONDUIT}` }, spender(`${'0'.repeat(23)}x${hex}`))).toThrow(notAddress)
  expect(() => checkApprove({ ...approveRequest, conduit: `0xg${hex.slice(1)}` }, spender(`${'0'.repeat(24)}g${hex.slice(1)}`))).toThrow(notAddress)
  expect(() => checkApprove({ ...approveRequest, conduit: new String(CONDUIT) as unknown as string }, approveTx)).toThrow(notAddress)
  expect(() => checkRedeem({ ...redeemRequest, receiver: OTHER.slice(2) }, redeemTx)).toThrow('receiver: not 0x and 40 hex digits')
  const salt = redeemRequest.salt.slice(2)
  const withSalt = (text: string) => ({ ...redeemTx, data: redeemTx.data.replace(salt, text) })
  const notSalt = 'salt: not 0x and 64 lowercase hex digits'
  expect(() => checkRedeem({ ...redeemRequest, salt: `${redeemRequest.salt}00` }, withSalt(`${salt}00`))).toThrow(notSalt)
  expect(() => checkRedeem({ ...redeemRequest, salt: ` ${redeemRequest.salt}` }, withSalt(`x${salt}`))).toThrow(notSalt)
  expect(() => checkRedeem({ ...redeemRequest, salt: `0x${salt.toUpperCase()}` }, redeemTx)).toThrow(notSalt)
  expect(() => checkRedeem({ ...redeemRequest, salt: new String(redeemRequest.salt) as unknown as string }, redeemTx)).toThrow(notSalt)
})

test('a deposit whose token is the Vehicle throws, so a registry mistake cannot turn a deposit into a burn of Conduit shares (SPEC section 5)', () => {
  const word = (address: string) => `${'0'.repeat(24)}${address.slice(2)}`
  const burn = { ...depositTx, data: depositTx.data.replace(word(USDC), word(VEHICLE)) }
  expect(() => checkDeposit({ ...depositRequest, token: VEHICLE }, burn)).toThrow('token: must not be the vehicle')
})

test('with a valid request, an answer that is not an object with to, data and value gives null and never throws, so a throw always means the request and null always means the answer', () => {
  expect(checkDeposit(depositRequest, null)).toBeNull()
  expect(checkDeposit(depositRequest, undefined)).toBeNull()
  expect(checkDeposit(depositRequest, depositTx.data)).toBeNull()
  expect(checkDeposit(depositRequest, 42)).toBeNull()
  expect(checkDeposit(depositRequest, [depositTx])).toBeNull()
  expect(checkDeposit(depositRequest, { ...depositTx, data: 42 })).toBeNull()
  expect(checkDeposit(depositRequest, { ...depositTx, to: null })).toBeNull()
  expect(checkApprove(approveRequest, null)).toBeNull()
  expect(checkRedeem(redeemRequest, undefined)).toBeNull()
  expect(checkDeposit(depositRequest, depositTx)).toStrictEqual(depositTx)
})

test('the test keccak256 gives the two digests of SPEC section 6, so the deposit tests above run on the Ethereum hash', () => {
  expect(keccak256('0x')).toBe('0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470')
  expect(keccak256('0x616263')).toBe('0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45')
})

test('NIST SHA3-256 in the place of Keccak-256 throws on the mainnet deposit and on an answer forged for that hash, so a wrong hash never yields a transaction', () => {
  const sha3 = (data: `0x${string}`) => `0x${new Bun.CryptoHasher('sha3-256').update(Buffer.from(data.slice(2), 'hex')).digest('hex')}`
  expect(sha3('0x616263')).toBe('0x3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532')
  expect(() => verifyDeposit({ request: depositRequest, response: depositTx, keccak256: sha3 })).toThrow('keccak256: not Keccak-256')
  const preimage: `0x${string}` = `0x${'0'.repeat(24)}${depositRequest.sender.slice(2)}${depositRequest.salt.slice(2)}`
  const forged = { ...depositTx, data: depositTx.data.replace('a33d32c6331dd73760fa94e36f17cb757dd0f74cfac71e8386176cff485b2b77', sha3(preimage).slice(2)) }
  expect(forged.data).not.toBe(depositTx.data)
  expect(() => verifyDeposit({ request: depositRequest, response: forged, keccak256: sha3 })).toThrow('keccak256: not Keccak-256')
})

test('the query salt is recomputed from the sender and the salt of each request, so an answer that keeps the query salt of another request is refused', () => {
  const request = { ...depositRequest, salt: OTHER_SALT }
  const stale = { ...depositTx, data: depositTx.data.replace(depositRequest.salt.slice(2), OTHER_SALT.slice(2)) }
  const fresh = { ...stale, data: stale.data.replace('a33d32c6331dd73760fa94e36f17cb757dd0f74cfac71e8386176cff485b2b77', '590384fbddea86b91fca203d7c3c49b83e01d940ab8f4557c96305039d74821f') }
  expect(checkDeposit(request, stale)).toBeNull()
  expect(checkDeposit(request, fresh)).toStrictEqual(fresh as Transaction)
})

test('a keccak256 that answers in uppercase is the same bytes, and one that answers 31 bytes throws, so a short digest is never padded into the call', () => {
  expect(verifyDeposit({ request: depositRequest, response: depositTx, keccak256: (data) => `0x${keccak256(data).slice(2).toUpperCase()}` })).toStrictEqual(depositTx)
  const short = (data: `0x${string}`) => (data === '0x' ? keccak256(data) : keccak256(data).slice(0, -2))
  const querySalt = 'a33d32c6331dd73760fa94e36f17cb757dd0f74cfac71e8386176cff485b2b77'
  const notDigest = 'keccak256 output: not 0x and 64 lowercase hex digits'
  expect(() => verifyDeposit({ request: depositRequest, response: { ...depositTx, data: depositTx.data.replace(querySalt, querySalt.slice(0, -2)) }, keccak256: short })).toThrow(notDigest)
  expect(() => verifyDeposit({ request: depositRequest, response: { ...depositTx, data: depositTx.data.replace(querySalt, `00${querySalt.slice(0, -2)}`) }, keccak256: short })).toThrow(notDigest)
})

type Vector = { name: string; route: string; request: object; transaction?: unknown; response?: unknown }

function verifyVector({ route, request }: Vector, response: unknown): Transaction | null {
  if (route === 'approve') return checkApprove(request as ApproveRequest, response)
  if (route === 'redeem') return checkRedeem(request as RedeemRequest, response)
  return checkDeposit(request as DepositRequest, response)
}

test('vectors.json holds 7 valid and 34 must-reject cases over the three routes, so the two loops below never pass on an empty list', () => {
  expect((vectors.valid as Vector[]).map((vector) => vector.route)).toEqual(['approve', 'approve', 'deposit', 'deposit', 'deposit', 'redeem', 'redeem'])
  expect(vectors.mustReject.length).toBe(34)
  expect((vectors.mustReject as Vector[]).filter((vector) => vector.route === 'deposit').length).toBe(20)
  expect((vectors.mustReject as Vector[]).filter((vector) => vector.route === 'approve').length).toBe(6)
  expect((vectors.mustReject as Vector[]).filter((vector) => vector.route === 'redeem').length).toBe(8)
})

test.each((vectors.valid as Vector[]).map((vector) => [vector.name, vector] as const))('vector "%s" returns its transaction, so the must-reject vectors are refused for what they change', (_name, vector) => {
  expect(verifyVector(vector, vector.transaction)).toStrictEqual(vector.transaction as Transaction)
})

test.each((vectors.mustReject as Vector[]).map((vector) => [vector.name, vector] as const))('vector "%s" gives null, so a user never signs it', (_name, vector) => {
  expect(verifyVector(vector, vector.response)).toBeNull()
})
