import type { EngineInterface, Register } from 'claude-code'

import { hasRtl, transformMarkdown, type Mode } from './bidi'

type Setting = Mode | 'auto'

let setting: Setting = 'auto'
let terminalMode: Mode | undefined

export const register: Register = (on, options) => {
  setting = (options.mode as Setting | undefined) ?? 'auto'
  terminalMode = undefined

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (!hasRtl(e.props.text)) return next(e)
    const mode = await modeFor($, e.surface)
    const text = transformMarkdown(e.props.text, mode, { columns: columnsFor(e.viewport?.columns) })
    return next({ ...e, props: { ...e.props, text } })
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (!hasRtl(e.props.text)) return next(e)
    const mode = await modeFor($, e.surface)
    const text = transformMarkdown(e.props.text, mode, { columns: columnsFor(e.viewport?.columns) })
    return next({ ...e, props: { ...e.props, text } })
  })
}

async function modeFor($: EngineInterface, surface: string): Promise<Mode> {
  if (setting !== 'auto') return setting
  // Browser-based surfaces run the Unicode bidi algorithm themselves.
  if (surface !== 'terminal') return 'isolate'
  terminalMode ??= await detectTerminal($)
  return terminalMode
}

/**
 * Terminals that implement the Unicode Bidirectional Algorithm get the bidi
 * controls; every other terminal draws characters in the order they arrive,
 * so it gets lines already reordered into visual order.
 */
async function detectTerminal($: EngineInterface): Promise<Mode> {
  const vte = await $.env.get('VTE_VERSION')
  const konsole = await $.env.get('KONSOLE_VERSION')
  const mlterm = await $.env.get('MLTERM')
  const program = await $.env.get('TERM_PROGRAM')
  if (vte || konsole || mlterm || program === 'Apple_Terminal') return 'isolate'
  return 'visual'
}

// The transcript indents a reply by its bullet and gutter.
function columnsFor(columns: number | undefined): number | undefined {
  return columns === undefined ? undefined : columns - 4
}
