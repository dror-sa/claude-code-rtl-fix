import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, RenderSurface } from 'claude-code'

const RLM = '‏'
const RLI = '⁧'
const LRI = '⁦'
const PDI = '⁩'

const MIXED = 'שלום, זה Claude Code בגרסה 2.1.291 (CLI).'

/** Renders an assistant message and returns the text the engine was handed. */
async function drawn($: Engine, on: On, text: string, surface: RenderSurface = 'terminal'): Promise<string> {
  let seen = ''
  on('ui.render', { component: 'AssistantMessage' }, (_$, e) => {
    seen = e.props.text
    return { type: 'Text', children: [e.props.text] }
  })
  await $.ui.render({ surface, component: 'AssistantMessage', requestId: 'm1', props: { text, isFirstOfReply: true } })
  return seen
}

describe('isolate mode', () => {
  test('wraps an RTL paragraph and isolates its English run', { options: { mode: 'isolate' } }, async ($, on) => {
    expect(await drawn($, on, MIXED)).toBe(
      `${RLM}${RLI}שלום, זה ${LRI}Claude Code${PDI} בגרסה 2.1.291 (${LRI}CLI${PDI}).${PDI}`,
    )
  })

  test('isolates a Hebrew phrase inside an English sentence', { options: { mode: 'isolate' } }, async ($, on) => {
    expect(await drawn($, on, 'The word שלום עולם means hello.')).toBe(`The word ${RLI}שלום עולם${PDI} means hello.`)
  })

  test('keeps list markers first and inline code LTR', { options: { mode: 'isolate' } }, async ($, on) => {
    expect(await drawn($, on, '- הרץ `npm install` עכשיו')).toBe(`- ${RLM}${RLI}הרץ ${LRI}\`npm install\`${PDI} עכשיו${PDI}`)
  })

  test('leaves fenced code blocks alone', { options: { mode: 'isolate' } }, async ($, on) => {
    const md = 'דוגמה:\n```js\nconst s = "שלום"\n```'
    expect(await drawn($, on, md)).toBe(`${RLM}${RLI}דוגמה:${PDI}\n\`\`\`js\nconst s = "שלום"\n\`\`\``)
  })

  test('passes English-only text through untouched', { options: { mode: 'isolate' } }, async ($, on) => {
    expect(await drawn($, on, 'Hello (world) 123')).toBe('Hello (world) 123')
  })
})

describe('visual mode', () => {
  test('reorders an RTL line for terminals without bidi', { options: { mode: 'visual' } }, async ($, on) => {
    expect(await drawn($, on, MIXED)).toBe('.(CLI) 2.1.291 הסרגב Claude Code הז ,םולש')
  })

  test('keeps the markdown heading marker and inline code in place', { options: { mode: 'visual' } }, async ($, on) => {
    expect(await drawn($, on, '## הרץ `npm i` עכשיו')).toBe('## וישכע `npm i` ץרה')
  })
})

describe('auto mode', () => {
  test('uses bidi controls on the desktop surface', async ($, on) => {
    expect(await drawn($, on, 'שלום world', 'desktop')).toBe(`${RLM}${RLI}שלום ${LRI}world${PDI}${PDI}`)
  })
})

test('rewrites user prompts too', { options: { mode: 'isolate' } }, async ($, on) => {
  let seen = ''
  on('ui.render', { component: 'UserMessage' }, (_$, e) => {
    seen = e.props.text
    return { type: 'Text', children: [e.props.text] }
  })
  await $.ui.render({
    surface: 'terminal',
    component: 'UserMessage',
    requestId: 'u1',
    props: { text: 'תקן את ה-bug', origin: { kind: 'composer' }, isExpanded: true },
  } as never)
  expect(seen).toBe(`${RLM}${RLI}תקן את ה-${LRI}bug${PDI}${PDI}`)
})
