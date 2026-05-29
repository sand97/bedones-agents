// Stable palette of soft, readable background colors for fallback avatars.
const AVATAR_PALETTE = [
  '#e57373',
  '#f06292',
  '#ba68c8',
  '#9575cd',
  '#7986cb',
  '#64b5f6',
  '#4fc3f7',
  '#4dd0e1',
  '#4db6ac',
  '#81c784',
  '#aed581',
  '#dce775',
  '#ffd54f',
  '#ffb74d',
  '#ff8a65',
  '#a1887f',
  '#90a4ae',
] as const

export function getAvatarColor(seed: string | null | undefined): string {
  if (!seed) return AVATAR_PALETTE[0]
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0
  }
  const idx = Math.abs(hash) % AVATAR_PALETTE.length
  return AVATAR_PALETTE[idx]
}
