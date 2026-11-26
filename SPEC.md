# Railnet approve, deposit and redeem transactions: specification

What a Railnet transaction service returns for an approve, a deposit and a redeem on a Conduit, byte for byte, and what the verifier (`verify.ts`) does with it. Where an implementation and this file disagree, this file is right.

The service builds one transaction per request, from the request alone: it reads no chain and holds no key. Its Conduits are on Ethereum mainnet, chain id 1. The chain id, the nonce and the gas are the integrator's to set.

## 1. Conventions

- A **word** is 32 bytes.
- `pad(address)`: 12 zero bytes then the 20 address bytes.
- `u256(n)`: 32 bytes, big-endian.
- `‖` is concatenation.
- `keccak256` is Keccak-256 (the Ethereum hash, not NIST SHA3-256). The verifier is given one that takes bytes as `0x` and hex digits and returns its 32 bytes the same way: the empty input is `0x`.
- A transaction is `{ to, data, value }`: `to` and `data` are hex with a `0x` prefix, `value` is always the string `"0"`.

## 2. Request

| Field | Routes | Format | Meaning |
|---|---|---|---|
| `conduit` | all | address | the Conduit |
| `token` | all | address | the token approved, deposited, or paid by the redeem |
| `vehicle` | deposit | address | the Conduit's Vehicle |
| `sender` | deposit | address | the account that signs: it receives the Conduit shares |
| `receiver` | redeem | address | the account that is paid: set it to the account that signs |
| `amount` | approve, deposit | decimal string | in the smallest unit of `token` |
| `shares` | redeem | decimal string | in Conduit shares |
| `minOutput` | deposit, redeem | decimal string | deposit: the fewest Vehicle shares it may yield. Redeem: the least `token` it may pay, before the Conduit's fees |
| `salt` | deposit, redeem | 32 bytes | the caller's own random bytes |

- An address is `0x` and 40 hex digits. Send it lowercase or EIP-55 checksummed, and never the zero address: the service refuses any other casing and the zero address. The verifier reads any casing as the same bytes and does not single out the zero address.
- A decimal string is digits only, at most 2^256 - 1. Leading zeros are the same number.
- `salt` is `0x` and 64 lowercase hex digits.
- Every field of a route is required. The service draws no salt and applies no default.
- The service answers for the Conduits of its own registry only, and refuses a `token` or a `vehicle` that is not the Conduit's. The verifier knows no registry: the integrator's own is what it trusts.

## 3. Calldata

Three functions, nothing else. Each `data` is the 4-byte selector of the function, then its arguments.

### approve

`approve(address spender, uint256 amount)`

`to` = `token`. `data` = `0x095ea7b3 ‖ pad(conduit) ‖ u256(amount)`. 68 bytes.

### create (deposit)

`create((address owner, address receiver, (address asset, uint256 value) input, (address asset, uint256 value) output, uint8 mode, bytes32 salt, bytes data) query, address receiver, bytes32 sourceSalt)`

`to` = `conduit`. `data` = `0x50bb3af4` then 13 words. 420 bytes with the selector.

| # | Word |
|---|---|
| 0 | `u256(0x60)` (offset of the query) |
| 1 | `pad(sender)` (the `receiver` argument of `create`, not the `receiver` field of a redeem request) |
| 2 | `salt` (the `sourceSalt` argument) |
| 3 | `pad(conduit)` (`query.owner`) |
| 4 | `pad(conduit)` (`query.receiver`) |
| 5 | `pad(token)` (`query.input.asset`) |
| 6 | `u256(amount)` (`query.input.value`) |
| 7 | `pad(vehicle)` (`query.output.asset`) |
| 8 | `u256(minOutput)` (`query.output.value`) |
| 9 | `u256(0)` (`query.mode`, DEPOSIT) |
| 10 | `keccak256(pad(sender) ‖ salt)` (`query.salt`) |
| 11 | `u256(0x120)` (offset of `query.data` inside the query) |
| 12 | `u256(0)` (length of `query.data`) |

### createRedeemFromConduitShares (redeem)

`createRedeemFromConduitShares(uint256 conduitShares, (address asset, uint256 value) outputAsset, bytes32 sourceSalt, address receiver)`

`to` = `conduit`. `data` = `0x4c717f8d ‖ u256(shares) ‖ pad(token) ‖ u256(minOutput) ‖ salt ‖ pad(receiver)`. 164 bytes.

## 4. What the verifier does

One function per route, given the integrator's own request and one response.

1. It checks the request, and throws an error that names the field, or `keccak256`, when:
   - an address, a decimal string or the salt is not in the format of section 2;
   - on a deposit, `token` is `vehicle` (section 5);
   - on a deposit, the `keccak256` it was given does not hash the empty input to `c5d2…a470` (section 6), or returns anything but `0x` and 64 hex digits.
2. It builds the transaction of section 3 from the request alone.
3. It returns `null` unless the response is an object whose `to` and `data` are strings equal to the built ones once lowercased, and whose `value` is the string `"0"`. A response never makes it throw.
4. Otherwise it returns the transaction it built, in lowercase hex. Never the response: a field the response adds does not reach the signer.

The wording of an error, and which field it names when several are wrong, are not part of this specification.

It does not check:

- that `vehicle` is the Conduit's Vehicle and `token` its asset: that is the integrator's registry;
- that `minOutput` is a sound floor: `"0"` is accepted when `"0"` is what was asked;
- which transactions a deposit needs and in what order (an approve, a reset to 0 before it for a token that requires one): each transaction is verified on its own;
- that the transaction succeeds: simulate it.

## 5. Contract rules behind it

Rules of the Conduit contract, as deployed on Ethereum mainnet when the two transactions of section 6 were sent.

- `create` reverts with `InvalidQuerySalt` unless `query.salt` is `keccak256(abi.encode(msg.sender, sourceSalt))`. So a deposit built for `sender` only passes when `sender` signs it.
- `create` with the Vehicle as `query.input.asset` burns the payer's Conduit shares: a redeem under the name of a deposit. The verifier refuses a deposit request whose `token` is `vehicle`.
- `createRedeemFromConduitShares` binds its salt to `msg.sender` and takes the shares from `msg.sender`, but pays `receiver`. On a Conduit with transfers enabled, nothing ties `receiver` to the signer.
- Its floor is enforced on what the Vehicle returns, before the Conduit's own fees.

## 6. Vectors

- `keccak256` of the empty input, `0x`: `c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470`
- `keccak256` of the 3 bytes `0x616263`, "abc" in ASCII: `4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45`

Deposit, the input of Ethereum mainnet transaction `0xd09f50435e0834cb7c2a3e44f6d010d91635d2049ad80741932ff8c3e121cb7b`:

- conduit `0x6b2bc4d0614d7744dc5f71b7a2555a9cef2535d9`, token `0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48`, vehicle `0xce532ed9019010657840a1484895ec00d5693a48`
- sender `0xde6308e382dca8b725bc66a0575304840e08d9a8`, amount `1000000`, minOutput `833746125109265740`
- salt `0xfd998ee5f4a1caddeefa25ce83121601e5326a0c70fe6601c3a95f71a67770c4`
- query salt `0xa33d32c6331dd73760fa94e36f17cb757dd0f74cfac71e8386176cff485b2b77`
- with the salt `0x1111111111111111111111111111111111111111111111111111111111111111` instead, the query salt is `0x590384fbddea86b91fca203d7c3c49b83e01d940ab8f4557c96305039d74821f`
- `data`:

```
0x50bb3af40000000000000000000000000000000000000000000000000000000000000060000000000000000000000000de6308e382dca8b725bc66a0575304840e08d9a8fd998ee5f4a1caddeefa25ce83121601e5326a0c70fe6601c3a95f71a67770c40000000000000000000000006b2bc4d0614d7744dc5f71b7a2555a9cef2535d90000000000000000000000006b2bc4d0614d7744dc5f71b7a2555a9cef2535d9000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800000000000000000000000000000000000000000000000000000000000f4240000000000000000000000000ce532ed9019010657840a1484895ec00d5693a480000000000000000000000000000000000000000000000000b920faef3ff054c0000000000000000000000000000000000000000000000000000000000000000a33d32c6331dd73760fa94e36f17cb757dd0f74cfac71e8386176cff485b2b7700000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000000
```

Redeem, the input of Ethereum mainnet transaction `0xfa57cefc561926f7f90936d006438e14d0d03be41c784b3279322d55898ce5f0`:

- same conduit and token, receiver `0xfe2f597f40da9c6abf6dea0b9cefe376a6117c7a`, shares `498798408652837363`, minOutput `498008`
- salt `0x1483afb0a95e65f56386f4fb6de2d64f3802d6382a5ebec628c6ef544c070035`
- `data`:

```
0x4c717f8d00000000000000000000000000000000000000000000000006ec16828a4851f3000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800000000000000000000000000000000000000000000000000000000000799581483afb0a95e65f56386f4fb6de2d64f3802d6382a5ebec628c6ef544c070035000000000000000000000000fe2f597f40da9c6abf6dea0b9cefe376a6117c7a
```

Approve of `1000000` to that Conduit, on that token:

```
0x095ea7b30000000000000000000000006b2bc4d0614d7744dc5f71b7a2555a9cef2535d900000000000000000000000000000000000000000000000000000000000f4240
```

That Conduit belongs to the staging deployment on mainnet. The service does not serve it and answers `403` to these requests: the vectors are for a verifier, run offline.

[vectors.json](vectors.json) holds these three, 4 more valid cases and 34 responses that must be refused, each as a route, a request and a transaction or a response. A verifier written in another language must return the transaction of every `valid` case and refuse every `mustReject` case.
