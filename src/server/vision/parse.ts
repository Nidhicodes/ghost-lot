import { z } from 'zod'

export const HAZARD_CLASSES = ['FUEL', 'AUTO', 'INDUSTRIAL', 'RAIL'] as const
export type HazardClass = (typeof HAZARD_CLASSES)[number]

export const CELLS = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'] as const
export type Cell = (typeof CELLS)[number]

/** Unknown or missing positions fall back to the tile centre rather than failing the read. */
const CellSchema = z
  .string()
  .transform((s) => s.trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/^middle$|^centre$/, 'center'))
  .pipe(z.enum(CELLS))
  .catch('center')

const Pass1Schema = z.object({
  hazards: z.array(
    z.object({
      class: z
        .string()
        .transform((s) => s.trim().toUpperCase())
        .pipe(z.enum(HAZARD_CLASSES)),
      map_text: z.string().max(300).catch(''),
      where: CellSchema.default('center'),
    }),
  ),
})

const Pass2Schema = z.object({
  gasoline_tank_marks: z.number().int().min(0).max(50),
  positions: z.array(CellSchema).max(50).default([]),
})

export type Pass1 = z.infer<typeof Pass1Schema>
export type Pass2 = z.infer<typeof Pass2Schema>

/** Strip reasoning blocks and code fences, then return the first balanced JSON object. */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```(?:json)?/g, '')
  const start = cleaned.indexOf('{')
  if (start < 0) throw new SyntaxError('No JSON object in model output')
  let depth = 0
  let inString = false
  for (let i = start; i < cleaned.length; i++) {
    const c = cleaned[i]
    if (inString) {
      if (c === '\\') i++
      else if (c === '"') inString = false
    } else if (c === '"') inString = true
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return JSON.parse(cleaned.slice(start, i + 1))
  }
  throw new SyntaxError('Unbalanced JSON object in model output')
}

export const parsePass1 = (text: string): Pass1 => Pass1Schema.parse(extractJson(text))

/** Positions are padded with the centre (or trimmed) so their count always equals the tank count. */
export function parsePass2(text: string): Pass2 {
  const p = Pass2Schema.parse(extractJson(text))
  const positions = Array.from({ length: p.gasoline_tank_marks }, (_, i) => p.positions[i] ?? ('center' as const))
  return { gasoline_tank_marks: p.gasoline_tank_marks, positions }
}
