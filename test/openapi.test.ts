import { expect, test } from 'bun:test'
import vectors from '../vectors.json'

type Example = { value: unknown }
type Operation = {
  requestBody: { content: { 'application/json': { examples: Record<string, Example> } } }
  responses: { '200': { content: { 'application/json': { examples: Record<string, Example> } } } }
}
type OpenApi = {
  paths: Record<string, { post: Operation }>
  components: { schemas: Record<string, { required: string[]; properties: Record<string, unknown> }> }
}

const openapi = Bun.YAML.parse(await Bun.file(new URL('../openapi.yaml', import.meta.url)).text()) as OpenApi

function example(route: string) {
  const operation = openapi.paths[`/v1/${route}`]?.post
  return {
    request: operation?.requestBody.content['application/json'].examples[route]?.value,
    transaction: operation?.responses['200'].content['application/json'].examples[route]?.value,
  }
}

function vector(index: number) {
  const { request, transaction } = (vectors.valid as { request: unknown; transaction: unknown }[])[index] ?? {}
  return { request, transaction }
}

test('each openapi.yaml example is a valid vector of vectors.json, request and transaction, so the HTTP file and the verifier never describe two different answers', () => {
  expect(example('approve')).toStrictEqual(vector(0))
  expect(example('deposit')).toStrictEqual(vector(2))
  expect(example('redeem')).toStrictEqual(vector(5))
})

test('openapi.yaml requires every field of a request and returns to, data and value only (SPEC section 2), so no default and no echoed field hides between the file and the service', () => {
  const { ApproveRequest, DepositRequest, RedeemRequest, Transaction } = openapi.components.schemas
  expect(ApproveRequest?.required.toSorted()).toEqual(['amount', 'conduit', 'token'])
  expect(DepositRequest?.required.toSorted()).toEqual(['amount', 'conduit', 'minOutput', 'salt', 'sender', 'token', 'vehicle'])
  expect(RedeemRequest?.required.toSorted()).toEqual(['conduit', 'minOutput', 'receiver', 'salt', 'shares', 'token'])
  expect(Object.keys(DepositRequest?.properties ?? {}).toSorted()).toEqual(['amount', 'conduit', 'minOutput', 'salt', 'sender', 'token', 'vehicle'])
  expect(Transaction?.required.toSorted()).toEqual(['data', 'to', 'value'])
  expect(Object.keys(Transaction?.properties ?? {}).toSorted()).toEqual(['data', 'to', 'value'])
})
