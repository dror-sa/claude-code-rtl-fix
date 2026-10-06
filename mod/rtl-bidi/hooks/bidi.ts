// Pure text transforms for right-to-left (Hebrew, Arabic, Persian, Syriac...)
// text inside the markdown Claude Code draws for transcript messages.
//
// Two strategies:
//   isolate: insert Unicode bidi controls (RLM, RLI/LRI ... PDI) so a renderer
//            that runs the Unicode Bidirectional Algorithm (browsers, the VS
//            Code and desktop surfaces, VTE / Konsole / Terminal.app) lays the
//            line out right to left with English runs kept intact.
//   visual:  reorder each line into visual order ourselves, for terminals that
//            draw characters in logical order and have no bidi support at all
//            (Windows Terminal, xterm.js / VS Code terminal, kitty, iTerm2...).
//
// Fenced code blocks are never touched, and inline code spans stay LTR.

export const RLM = '‏'
export const RLI = '⁧'
export const LRI = '⁦'
export const PDI = '⁩'

export type Mode = 'isolate' | 'visual' | 'off'

export type Options = {
  /** Columns available to the text, for pre-wrapping in visual mode. */
  columns?: number
}

const RTL_CHAR = /[֐-׿؀-޿߀-ࣿיִ-﷿ﹰ-﻿]/
const LETTER = /\p{L}/u
const MARK = /\p{M}/u
const DIGIT = /[0-9٠-٩۰-۹]/
const NUM_SEP = /[.,:/]/

export function hasRtl(s: string): boolean {
  return RTL_CHAR.test(s)
}

/** Transform a whole markdown message. */
export function transformMarkdown(md: string, mode: Mode, opts: Options = {}): string {
  if (mode === 'off' || !hasRtl(md)) return md
  const lines = md.split('\n')
  const out: string[] = []
  let fence: string | null = null

  for (const line of lines) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1]
    if (fence !== null) {
      out.push(line)
      if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = null
      continue
    }
    if (marker) {
      fence = marker
      out.push(line)
      continue
    }
    out.push(transformLine(line, mode, opts))
  }
  return out.join('\n')
}

// ---------------------------------------------------------------------------
// Line structure

const PREFIX = /^(\s*(?:(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?|#{1,6}\s+|>\s?)*)/

function transformLine(line: string, mode: Mode, opts: Options): string {
  if (!hasRtl(line)) return line

  // Tables: each cell is its own paragraph.
  if (/^\s*\|/.test(line)) {
    return line
      .split('|')
      .map(cell => (hasRtl(cell) ? transformSegment(cell, mode, opts, true) : cell))
      .join('|')
  }

  const prefix = PREFIX.exec(line)?.[1] ?? ''
  const body = line.slice(prefix.length)
  const indent = ' '.repeat(prefix.length)
  return prefix + transformSegment(body, mode, opts, false, indent)
}

function transformSegment(text: string, mode: Mode, opts: Options, isCell: boolean, indent = ''): string {
  // Keep the cell's padding where it is.
  const lead = /^\s*/.exec(text)![0]
  const trail = /\s*$/.exec(text.slice(lead.length))![0]
  const core = text.slice(lead.length, text.length - trail.length)
  if (!core) return text

  const { units, atoms } = tokenize(core)
  const rtl = isRtlParagraph(units)
  const body =
    mode === 'isolate'
      ? isolate(units, atoms, rtl)
      : visual(units, atoms, rtl, isCell ? undefined : opts.columns && opts.columns - indent.length, indent)
  return lead + body + trail
}

// ---------------------------------------------------------------------------
// Tokenizing: graphemes (base + combining marks) and protected atoms

type Cls = 'R' | 'L' | 'EN' | 'N'
type Unit = { text: string; cls: Cls; atom?: number }
type Atom = { kind: 'code' | 'link' | 'url'; text: string; label?: string; href?: string }

const ATOM = /(`+)[^`]*?\1|\[([^\]\n]*)\]\(([^)\s]+)\)|https?:\/\/[^\s)]+/gu

function tokenize(s: string): { units: Unit[]; atoms: Atom[] } {
  const units: Unit[] = []
  const atoms: Atom[] = []
  let last = 0
  for (const m of s.matchAll(ATOM)) {
    pushChars(units, s.slice(last, m.index))
    let atom: Atom
    if (m[1]) atom = { kind: 'code', text: m[0] }
    else if (m[3] !== undefined) atom = { kind: 'link', text: m[0], label: m[2], href: m[3] }
    else atom = { kind: 'url', text: m[0] }
    // A link whose label is RTL behaves as an RTL word; everything else is LTR.
    const cls: Cls = atom.kind === 'link' && isRtlText(atom.label ?? '') ? 'R' : 'L'
    units.push({ text: m[0], cls, atom: atoms.length })
    atoms.push(atom)
    last = m.index! + m[0].length
  }
  pushChars(units, s.slice(last))
  return { units, atoms }
}

function pushChars(units: Unit[], s: string) {
  for (const ch of s) {
    const prev = units[units.length - 1]
    if (MARK.test(ch) && prev && prev.atom === undefined) {
      prev.text += ch
      continue
    }
    units.push({ text: ch, cls: classify(ch) })
  }
}

function classify(ch: string): Cls {
  if (DIGIT.test(ch)) return 'EN'
  if (RTL_CHAR.test(ch)) return 'R'
  if (LETTER.test(ch)) return 'L'
  return 'N'
}

function isRtlText(s: string): boolean {
  return isRtlParagraph(tokenize(s).units)
}

/**
 * A paragraph reads right to left when its first strong letter is RTL, or when
 * it has at least as many RTL letters as LTR ones ("Claude Code הוא כלי מצוין").
 */
function isRtlParagraph(units: Unit[]): boolean {
  let r = 0
  let l = 0
  let first: Cls | null = null
  for (const u of units) {
    // Code and URLs say nothing about the language of the sentence around them.
    if (u.atom !== undefined && u.cls === 'L') continue
    if (u.cls === 'R') r++
    else if (u.cls === 'L') l++
    else continue
    first ??= u.cls
  }
  if (first === null) return false
  return first === 'R' || r >= l
}

// ---------------------------------------------------------------------------
// Strategy 1: bidi controls

const OPEN = '([{<'
const CLOSE = ')]}>'

function isolate(units: Unit[], atoms: Atom[], rtl: boolean): string {
  const runs = findRuns(units, rtl ? 'L' : 'R')
  let out = ''
  let i = 0
  for (const [start, end] of runs) {
    out += emit(units.slice(i, start), atoms, rtl)
    out += (rtl ? LRI : RLI) + emit(units.slice(start, end), atoms, false) + PDI
    i = end
  }
  out += emit(units.slice(i), atoms, rtl)
  // RLM makes the paragraph RTL where the renderer picks the direction from the
  // first strong character; RLI..PDI makes it RTL where the direction is fixed LTR.
  return rtl ? RLM + RLI + out + PDI : out
}

function emit(units: Unit[], atoms: Atom[], isolateCode: boolean): string {
  return units
    .map(u => {
      if (u.atom === undefined) return u.text
      const atom = atoms[u.atom]!
      // Inline code inside RTL text keeps its own LTR order.
      return isolateCode && atom.kind === 'code' ? LRI + atom.text + PDI : atom.text
    })
    .join('')
}

/**
 * Maximal runs of the opposite direction: from its first strong unit to its
 * last strong or digit unit, with any neutrals in between, extended over the
 * closing brackets it opened. Digits alone never start a run.
 */
function findRuns(units: Unit[], cls: 'R' | 'L'): Array<[number, number]> {
  const other: Cls = cls === 'R' ? 'L' : 'R'
  const runs: Array<[number, number]> = []
  let i = 0
  while (i < units.length) {
    if (units[i]!.cls !== cls) {
      i++
      continue
    }
    let end = i + 1
    let j = i + 1
    while (j < units.length && units[j]!.cls !== other) {
      if (units[j]!.cls === cls || units[j]!.cls === 'EN') end = j + 1
      j++
    }
    end = extendOverBrackets(units, i, end)
    runs.push([i, end])
    i = end
  }
  return runs
}

function extendOverBrackets(units: Unit[], start: number, end: number): number {
  let depth = 0
  for (let k = start; k < end; k++) {
    if (OPEN.includes(units[k]!.text)) depth++
    else if (CLOSE.includes(units[k]!.text)) depth = Math.max(0, depth - 1)
  }
  while (depth > 0 && end < units.length && units[end]!.cls === 'N') {
    if (CLOSE.includes(units[end]!.text)) depth--
    end++
  }
  return end
}

// ---------------------------------------------------------------------------
// Strategy 2: visual reordering (a reduced Unicode Bidirectional Algorithm:
// no explicit embeddings, Arabic numbers treated as European ones)

const MIRROR: Record<string, string> = {
  '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<',
  '«': '»', '»': '«', '‹': '›', '›': '‹',
}

function visual(units: Unit[], atoms: Atom[], rtl: boolean, columns: number | undefined, indent: string): string {
  const lines = columns && columns > 10 ? wrap(units, columns) : [units]
  return lines.map(line => reorder(line, atoms, rtl)).join('\n' + indent)
}

function wrap(units: Unit[], columns: number): Unit[][] {
  const lines: Unit[][] = []
  let line: Unit[] = []
  let width = 0
  let lastSpace = -1
  for (const u of units) {
    line.push(u)
    width += widthOf(u)
    if (u.text === ' ') lastSpace = line.length - 1
    if (width > columns && lastSpace > 0) {
      lines.push(line.slice(0, lastSpace))
      line = line.slice(lastSpace + 1)
      width = line.reduce((w, x) => w + widthOf(x), 0)
      lastSpace = line.findIndex(x => x.text === ' ')
    }
  }
  lines.push(line)
  return lines
}

function widthOf(u: Unit): number {
  return [...u.text].filter(c => !MARK.test(c)).length
}

function reorder(units: Unit[], atoms: Atom[], rtl: boolean): string {
  if (units.length === 0) return ''
  const base = rtl ? 1 : 0
  const baseCls: Cls = rtl ? 'R' : 'L'
  const cls = units.map(u => u.cls)

  // W4: a single separator between two digits joins the number (2.1.291, 1,000).
  for (let i = 1; i < cls.length - 1; i++) {
    if (cls[i] === 'N' && NUM_SEP.test(units[i]!.text) && cls[i - 1] === 'EN' && cls[i + 1] === 'EN') cls[i] = 'EN'
  }
  // W7: digits after an LTR letter (or at the start of an LTR paragraph) are LTR.
  let strong: Cls = baseCls
  for (let i = 0; i < cls.length; i++) {
    if (cls[i] === 'R' || cls[i] === 'L') strong = cls[i]!
    else if (cls[i] === 'EN' && strong === 'L') cls[i] = 'L'
  }
  // N1/N2: neutrals take the direction of their surroundings when both sides
  // agree (digits count as RTL), otherwise the paragraph's.
  const dir = (c: Cls): Cls => (c === 'EN' ? 'R' : c)
  for (let i = 0; i < cls.length; ) {
    if (cls[i] !== 'N') {
      i++
      continue
    }
    let j = i
    while (j < cls.length && cls[j] === 'N') j++
    const before = i === 0 ? baseCls : dir(cls[i - 1]!)
    const after = j === cls.length ? baseCls : dir(cls[j]!)
    const resolved = before === after ? before : baseCls
    for (let k = i; k < j; k++) cls[k] = resolved
    i = j
  }
  // I1/I2: levels.
  const levels = cls.map(c => {
    if (base === 0) return c === 'L' ? 0 : c === 'R' ? 1 : 2
    return c === 'R' ? 1 : 2
  })
  // L1: trailing whitespace goes to the paragraph level.
  for (let i = units.length - 1; i >= 0 && /^\s$/.test(units[i]!.text); i--) levels[i] = base

  // L2: reverse every run at each level from the highest down to the lowest odd one.
  const order = units.map((_, i) => i)
  const max = Math.max(...levels)
  const minOdd = levels.reduce((m, l) => (l % 2 === 1 ? Math.min(m, l) : m), Infinity)
  for (let level = max; level >= minOdd && level > 0; level--) {
    for (let i = 0; i < order.length; ) {
      if (levels[order[i]!]! < level) {
        i++
        continue
      }
      let j = i
      while (j < order.length && levels[order[j]!]! >= level) j++
      const run = order.slice(i, j).reverse()
      order.splice(i, j - i, ...run)
      i = j
    }
  }

  return order
    .map(i => {
      const u = units[i]!
      const odd = levels[i]! % 2 === 1
      if (u.atom !== undefined) {
        const atom = atoms[u.atom]!
        if (atom.kind === 'link') return `[${reorderText(atom.label ?? '')}](${atom.href})`
        return atom.text
      }
      return odd ? MIRROR[u.text] ?? u.text : u.text
    })
    .join('')
}

function reorderText(s: string): string {
  const { units, atoms } = tokenize(s)
  return reorder(units, atoms, isRtlParagraph(units))
}
