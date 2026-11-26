const MAX_UINT64 = (1n << 64n) - 1n

const ROUND_CONSTANTS = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n, 0x000000000000808bn,
  0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n, 0x000000000000008an, 0x0000000000000088n,
  0x0000000080008009n, 0x000000008000000an, 0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n,
  0x8000000000008003n, 0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
]
const ROTATIONS = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14]

const rotate = (lane: bigint, shift: number) => ((lane << BigInt(shift)) | (lane >> BigInt(64 - shift))) & MAX_UINT64
const reverseBytes = (hex: string) => (hex.match(/../g) ?? []).reverse().join('')

/** Keccak-256 of at most 134 bytes of 0x-prefixed hex: one block. A longer input throws. For the tests only. */
export function keccak256(data: `0x${string}`): string {
  const hex = data.slice(2)
  const block = `${hex}01${'00'.repeat(134 - hex.length / 2)}80`
  let state: bigint[] = []
  for (let index = 0; index < 25; index++) {
    state.push(index < 17 ? BigInt(`0x${reverseBytes(block.slice(index * 16, index * 16 + 16))}`) : 0n)
  }
  const lane = (lanes: bigint[], index: number) => lanes[index] ?? 0n

  for (const constant of ROUND_CONSTANTS) {
    const parity: bigint[] = []
    for (let x = 0; x < 5; x++) {
      parity.push(lane(state, x) ^ lane(state, x + 5) ^ lane(state, x + 10) ^ lane(state, x + 15) ^ lane(state, x + 20))
    }
    const moved: bigint[] = new Array(25).fill(0n)
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        const mixed = lane(state, x + 5 * y) ^ lane(parity, (x + 4) % 5) ^ rotate(lane(parity, (x + 1) % 5), 1)
        moved[y + 5 * ((2 * x + 3 * y) % 5)] = rotate(mixed, ROTATIONS[x + 5 * y] ?? 0)
      }
    }
    state = moved.map((value, index) => {
      const row = index - (index % 5)
      return value ^ (~lane(moved, row + ((index + 1) % 5)) & lane(moved, row + ((index + 2) % 5)))
    })
    state[0] = lane(state, 0) ^ constant
  }

  let digest = '0x'
  for (let index = 0; index < 4; index++) digest += reverseBytes(lane(state, index).toString(16).padStart(16, '0'))
  return digest
}
