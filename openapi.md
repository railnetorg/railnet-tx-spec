# Railnet transaction API

Builds the transactions a user signs to deposit into a Railnet Conduit and to redeem from it.
Each call returns one unsigned transaction, `{ to, data, value }`. The service encodes calldata
and nothing else: it reads no chain, holds no key and keeps no state.

**Verify every response before signing.** The calldata is deterministic: the response is a
reference to check against, not a source of trust.

1. Send every field yourself. Your own `salt` with every deposit and redeem: 32 random bytes,
   new for each transaction. The service draws no salt and applies no default.
2. The two base URLs you were given are two independent deployments. Send the same request
   to both and stop on any difference or missing answer: never fall back on one of them.
3. Rebuild the transaction locally from the request you sent and compare it byte for byte
   with each response. [verify.ts](verify.ts) does it with no dependency. Sign the
   transaction it returns, never a response.
4. Simulate the transaction.

`conduit`, `token` and `vehicle` come from your own registry, never from an API.

The examples are the inputs of two Ethereum mainnet transactions, on a Conduit of the staging
deployment: sent to the service, they are answered `403`. [SPEC.md](SPEC.md) gives the bytes
behind each of them.

## Calling the API

- Every route is a `POST` with a JSON body of 4096 bytes at most.
- Send your API key in the `x-api-key` header, on every request.
- The base URL is the one you were given. The examples read it from `$TX_API_URL`, and the key from `$TX_API_KEY`.

## Types

| Type | JSON | Format |
|---|---|---|
| `Address` | string | A 20-byte address, lowercase or EIP-55 checksummed. Never the zero address. |
| `Uint256` | string | An unsigned integer up to 2^256 - 1, as a decimal string in the smallest unit. Never a JSON number. |
| `Bytes32` | string | 32 bytes of lowercase hex. |

## POST /v1/approve

Builds `token.approve(conduit, amount)`: the allowance the Conduit needs before a deposit.
The transaction is sent to the token.

| Field | Type | Required | Description |
|---|---|---|---|
| `conduit` | [Address](#types) | yes | The Conduit, which becomes the spender. |
| `token` | [Address](#types) | yes | The Conduit's asset, `conduit.asset()`. |
| `amount` | [Uint256](#types) | yes | The allowance, in the token's smallest unit. |

Returns `200` with:

| Field | Type | Description |
|---|---|---|
| `to` | [Address](#types) | The token for an approve, the Conduit for a deposit or a redeem. Written as you sent it. |
| `data` | string | The calldata, lowercase hex. |
| `value` | `"0"` | Always `"0"`. |

**Approve 1 USDC**

```bash
curl -s -X POST "$TX_API_URL/v1/approve" \
  -H "x-api-key: $TX_API_KEY" \
  -d '{"conduit":"0x6b2bc4d0614d7744dc5f71b7a2555a9cef2535d9","token":"0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48","amount":"1000000"}'
```

```json
{
  "to": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  "data": "0x095ea7b30000000000000000000000006b2bc4d0614d7744dc5f71b7a2555a9cef2535d900000000000000000000000000000000000000000000000000000000000f4240",
  "value": "0"
}
```

## POST /v1/deposit

Builds `conduit.create(query, sender, salt)`: a deposit of `amount` of `token`, for at least
`minOutput` Vehicle shares. The transaction is sent to the Conduit, by `sender`, who
receives the Conduit shares. Any other sender makes it revert.

| Field | Type | Required | Description |
|---|---|---|---|
| `conduit` | [Address](#types) | yes | The Conduit to deposit into. |
| `vehicle` | [Address](#types) | yes | The Conduit's Vehicle, `conduit.getVehicle()`. It is the asset of the deposit's output. |
| `token` | [Address](#types) | yes | The Conduit's asset, `conduit.asset()`. |
| `amount` | [Uint256](#types) | yes | The amount to deposit, in the token's smallest unit. |
| `sender` | [Address](#types) | yes | The account that sends the transaction and receives the Conduit shares. |
| `minOutput` | [Uint256](#types) | yes | A floor in Vehicle shares. `"0"` sets none. |
| `salt` | [Bytes32](#types) | yes | Yours, 32 random bytes, new for each transaction. The same request always returns the same bytes. |

Returns `200` with:

| Field | Type | Description |
|---|---|---|
| `to` | [Address](#types) | The token for an approve, the Conduit for a deposit or a redeem. Written as you sent it. |
| `data` | string | The calldata, lowercase hex. |
| `value` | `"0"` | Always `"0"`. |

**Deposit 1 USDC**

```bash
curl -s -X POST "$TX_API_URL/v1/deposit" \
  -H "x-api-key: $TX_API_KEY" \
  -d '{"conduit":"0x6b2bc4d0614d7744dc5f71b7a2555a9cef2535d9","vehicle":"0xce532ed9019010657840a1484895ec00d5693a48","token":"0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48","amount":"1000000","sender":"0xde6308e382dca8b725bc66a0575304840e08d9a8","minOutput":"833746125109265740","salt":"0xfd998ee5f4a1caddeefa25ce83121601e5326a0c70fe6601c3a95f71a67770c4"}'
```

```json
{
  "to": "0x6b2bc4d0614d7744dc5f71b7a2555a9cef2535d9",
  "data": "0x50bb3af40000000000000000000000000000000000000000000000000000000000000060000000000000000000000000de6308e382dca8b725bc66a0575304840e08d9a8fd998ee5f4a1caddeefa25ce83121601e5326a0c70fe6601c3a95f71a67770c40000000000000000000000006b2bc4d0614d7744dc5f71b7a2555a9cef2535d90000000000000000000000006b2bc4d0614d7744dc5f71b7a2555a9cef2535d9000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800000000000000000000000000000000000000000000000000000000000f4240000000000000000000000000ce532ed9019010657840a1484895ec00d5693a480000000000000000000000000000000000000000000000000b920faef3ff054c0000000000000000000000000000000000000000000000000000000000000000a33d32c6331dd73760fa94e36f17cb757dd0f74cfac71e8386176cff485b2b7700000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000000",
  "value": "0"
}
```

## POST /v1/redeem

Builds `conduit.createRedeemFromConduitShares(shares, (token, minOutput), salt, receiver)`:
a redeem of `shares` Conduit shares for at least `minOutput` of `token`. The transaction is
sent to the Conduit. `receiver` is paid whoever sends it: set it to the account that sends
the transaction.

| Field | Type | Required | Description |
|---|---|---|---|
| `conduit` | [Address](#types) | yes | The Conduit to redeem from. |
| `token` | [Address](#types) | yes | The Conduit's asset, `conduit.asset()`. |
| `shares` | [Uint256](#types) | yes | The Conduit shares to redeem, in their smallest unit. |
| `receiver` | [Address](#types) | yes | The account that is paid. |
| `minOutput` | [Uint256](#types) | yes | A floor in the token, before the Conduit's fees. `"0"` sets none. |
| `salt` | [Bytes32](#types) | yes | Yours, 32 random bytes, new for each transaction. The same request always returns the same bytes. |

Returns `200` with:

| Field | Type | Description |
|---|---|---|
| `to` | [Address](#types) | The token for an approve, the Conduit for a deposit or a redeem. Written as you sent it. |
| `data` | string | The calldata, lowercase hex. |
| `value` | `"0"` | Always `"0"`. |

**Redeem about 0.5 Conduit share to USDC**

```bash
curl -s -X POST "$TX_API_URL/v1/redeem" \
  -H "x-api-key: $TX_API_KEY" \
  -d '{"conduit":"0x6b2bc4d0614d7744dc5f71b7a2555a9cef2535d9","token":"0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48","shares":"498798408652837363","receiver":"0xfe2f597f40da9c6abf6dea0b9cefe376a6117c7a","minOutput":"498008","salt":"0x1483afb0a95e65f56386f4fb6de2d64f3802d6382a5ebec628c6ef544c070035"}'
```

```json
{
  "to": "0x6b2bc4d0614d7744dc5f71b7a2555a9cef2535d9",
  "data": "0x4c717f8d00000000000000000000000000000000000000000000000006ec16828a4851f3000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800000000000000000000000000000000000000000000000000000000000799581483afb0a95e65f56386f4fb6de2d64f3802d6382a5ebec628c6ef544c070035000000000000000000000000fe2f597f40da9c6abf6dea0b9cefe376a6117c7a",
  "value": "0"
}
```

## Errors

Every error is a JSON object with one field, `error`, that says what was refused.

| Status | When | Example |
|---|---|---|
| `400` | The body is not valid, or `token` or `vehicle` is not the Conduit's. | `{"error":"amount: uint256 decimal string expected"}` |
| `401` | No `x-api-key`, or one that is not registered. Any other path or method is a `404` once the key is accepted. | `{"error":"unauthorized"}` |
| `403` | The deployment does not serve this Conduit. | `{"error":"conduit: not served"}` |
| `413` | The body is over 4096 bytes. | `{"error":"body: 4096 bytes at most"}` |

---

Generated from [openapi.yaml](openapi.yaml) by [openapi.build.ts](openapi.build.ts). Do not edit by hand.
