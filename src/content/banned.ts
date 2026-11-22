/**
 * Phrases Ghost Lot must never use about a specific place (see .kiro/steering/safety-language.md).
 * The disclaimer's "whether a site is contaminated" is allowed: it is a question, not a claim.
 */
export const BANNED: { pattern: RegExp; example: string }[] = [
  { pattern: /\b(?:is|are|was|be|been|lot|site|property|soil|block)\s+contaminated\b/i, example: 'contaminated' },
  { pattern: /\bcontamination at\b/i, example: 'contamination at' },
  { pattern: /\btoxic\b/i, example: 'toxic' },
  { pattern: /\bpoisoned\b/i, example: 'poisoned' },
  { pattern: /\bunsafe\b/i, example: 'unsafe' },
  { pattern: /\bdangerous\b/i, example: 'dangerous' },
  { pattern: /\bpolluted\b/i, example: 'polluted' },
  { pattern: /\bhas a leaking tank\b/i, example: 'has a leaking tank' },
  { pattern: /\bthere is a tank here\b/i, example: 'there is a tank here' },
  { pattern: /\bguaranteed\b/i, example: 'guaranteed' },
  { pattern: /\bcertified\b/i, example: 'certified' },
  { pattern: /\bverified safe\b/i, example: 'verified safe' },
]

/** Exact phrasings that use a banned word as a question, not a claim. */
const ALLOWED = [/whether a site is contaminated/gi]

export function findBanned(text: string): string[] {
  const checked = ALLOWED.reduce((t, a) => t.replace(a, ''), text)
  return BANNED.filter((b) => b.pattern.test(checked)).map((b) => b.example)
}
