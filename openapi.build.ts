const directory = import.meta.dir

type Json = Record<string, any>
const spec: Json = Bun.YAML.parse(await Bun.file(`${directory}/openapi.yaml`).text()) as Json

const resolve = (node: Json): Json => (node?.$ref ? { ...spec.components[node.$ref.split('/')[2]][node.$ref.split('/')[3]], ...node } : node)
const typeOf = (node: Json) => (node.$ref ? `[${node.$ref.split('/')[3]}](#types)` : node.enum ? node.enum.map((value: string) => `\`"${value}"\``).join(' or ') : node.type)
const cell = (text: string) => text.replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|').trim()
const table = (head: string[], rows: string[][]) =>
  [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`)].join('\n')
const fence = (language: string, code: string) => `\`\`\`${language}\n${code}\n\`\`\``

const key = spec.components.securitySchemes.apiKey
const lines: string[] = [
  `# ${spec.info.title}`,
  spec.info.description.trim(),
  '## Calling the API',
  [
    `- Every route is a \`POST\` with a JSON body of 4096 bytes at most.`,
    `- Send your API key in the \`${key.name}\` header, on every request.`,
    `- The base URL is the one you were given. The examples read it from \`$TX_API_URL\`, and the key from \`$TX_API_KEY\`.`,
  ].join('\n'),
  '## Types',
  table(
    ['Type', 'JSON', 'Format'],
    ['Address', 'Uint256', 'Bytes32'].map((name) => [`\`${name}\``, 'string', spec.components.schemas[name].description]),
  ),
]

for (const [path, { post }] of Object.entries<Json>(spec.paths)) {
  const content = post.requestBody.content['application/json']
  const body = resolve(content.schema)
  lines.push(`## POST ${path}`, post.description.trim())
  lines.push(
    table(
      ['Field', 'Type', 'Required', 'Description'],
      Object.entries<Json>(body.properties).map(([name, property]) => [
        `\`${name}\``,
        typeOf(property),
        body.required.includes(name) ? 'yes' : 'no',
        property.description,
      ]),
    ),
  )

  const answers = post.responses['200'].content['application/json']
  const answer = resolve(answers.schema)
  lines.push(
    `Returns \`200\` with:`,
    table(
      ['Field', 'Type', 'Description'],
      Object.entries<Json>(answer.properties).map(([name, property]) => [`\`${name}\``, typeOf(property), property.description]),
    ),
  )

  for (const [name, example] of Object.entries<Json>(content.examples)) {
    lines.push(
      `**${example.summary}**`,
      fence('bash', `curl -s -X POST "$TX_API_URL${path}" \\\n  -H "${key.name}: $TX_API_KEY" \\\n  -d '${JSON.stringify(example.value)}'`),
      fence('json', JSON.stringify(answers.examples[name].value, null, 2)),
    )
  }
}

const first = Object.values<Json>(spec.paths)[0]?.post
lines.push(
  '## Errors',
  'Every error is a JSON object with one field, `error`, that says what was refused.',
  table(
    ['Status', 'When', 'Example'],
    Object.entries<Json>(first.responses)
      .filter(([status]) => status !== '200')
      .map(([status, response]) => {
        const { description, content } = resolve(response)
        return [`\`${status}\``, description, `\`${JSON.stringify(content['application/json'].example)}\``]
      }),
  ),
  `---\n\nGenerated from [openapi.yaml](openapi.yaml) by [openapi.build.ts](openapi.build.ts). Do not edit by hand.`,
)

export const markdown = `${lines.join('\n\n')}\n`

if (import.meta.main) await Bun.write(`${directory}/openapi.md`, markdown)
