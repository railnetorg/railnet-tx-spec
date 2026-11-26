# railnet-tx-spec

A verifier for the transactions a Railnet transaction service returns. You rebuild the transaction from your own request, compare it byte for byte with the response, and sign the one you rebuilt.

| Path | What |
|---|---|
| [verify.ts](verify.ts) | the verifier: one file to copy, no import, no dependency |
| [SPEC.md](SPEC.md) | the request, the three calldata layouts, what the verifier checks and what it does not |
| [vectors.json](vectors.json) | 7 requests with the transaction they must give and 34 responses that must be refused, for a verifier written in another language |
| `test/` | the verifier against the vectors and two Ethereum mainnet transactions |

## Use it

Copy `verify.ts` into your code and pin that copy. It needs `BigInt` and, for a deposit, a Keccak-256 function that you pass in: `keccak256` from ethers or viem fits as is.

```ts
import { keccak256 } from 'ethers';
import { type DepositRequest, verifyDeposit } from './verify';

async function depositTransaction(request: DepositRequest, urls: string[], apiKey: string) {
  const [transaction, ...others] = await Promise.all(
    urls.map(async (url) => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'content-type': 'application/json' },
        body: JSON.stringify(request),
      });
      if (!response.ok) throw new Error(`${url}: ${response.status} ${await response.text()}`);
      const rebuilt = verifyDeposit({ request, response: await response.json(), keccak256 });
      if (rebuilt === null) throw new Error(`${url}: the response is not the deposit asked for`);
      return rebuilt;
    }),
  );
  if (transaction === undefined || others.length === 0) throw new Error('two deployments are required');
  return transaction;
}
```

`urls` is the `/v1/deposit` route of each deployment you were given. `verifyApprove` and `verifyRedeem` take `{ request, response }`.

- Build the request from your own values, every field included: the addresses from your registry, the amounts from your user, a `salt` of 32 random bytes that is new for each transaction. Never from a response.
- Sign the transaction the verifier returns, never a response. The chain id, the nonce and the gas are yours.

| Result | Meaning | What to do |
|---|---|---|
| a transaction | the response is the exact encoding of your request | simulate it, then sign it |
| `null` | a `200` response is not the call you asked for | do not sign, do not fall back on another deployment, and send Railnet the request and the raw responses |
| a thrown error | your request or your `keccak256` is wrong, and the message names the field | fix the request: the service is not at fault |
| a status other than `200` | nothing to verify: the body is `{ error }` | `401` is your key, `400` names a field of your request, `403` is a Conduit the service does not serve |

The verifier does not check your registry, your `minOutput`, which transactions a deposit needs, or that the transaction succeeds: [SPEC.md](SPEC.md), section 4.

## Before the production key

The verifier only protects a user when it runs on every transaction. Before a production key is issued, confirm in writing that:

1. Your verifier, this one or your own port of it, returns the transaction of the 7 `valid` cases of [vectors.json](vectors.json) and refuses its 34 `mustReject` cases.
2. In the shipped flow, every transaction is rebuilt and compared before it is shown for signing, and what is signed is the rebuilt transaction, never the response.
3. A mismatch, or a missing answer from either deployment, stops the flow: there is no fallback on the other deployment.

## Run

```bash
bun install && bun test test
```
