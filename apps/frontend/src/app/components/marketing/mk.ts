/**
 * Shared Tailwind utility constants for the marketing site.
 *
 * RULE: All mk-* classes that appear in multiple files are defined here once.
 * Import and use instead of duplicating long className strings.
 *
 * Variables resolved:
 *   --mk-text       = #111b21   (var(--color-text-primary))
 *   --mk-text-muted = #494949   (var(--color-text-secondary))
 *   --mk-text-soft  = #8c8c8c   (var(--color-text-tertiary))
 *   --mk-bg         = #fafafa   (var(--color-bg-page))
 *   --mk-surface    = #ffffff
 *   --mk-surface-tinted = #f5f5f5
 *   --mk-border     = #e5e7eb
 *   --mk-border-soft = #f0f0f0
 *   --mk-radius-card = 20px
 *   --mk-radius-pill = 999px
 *   --mk-shadow-card = 0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.04)
 *   --mk-shadow-nav  = 0 1px 0 rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.05)
 *   --mk-shadow-soft = 0 1px 2px rgba(0,0,0,0.03)
 *   --mk-font-display = -apple-system, 'SF Pro Display', ...
 *   --mk-font-body    = -apple-system, 'SF Pro Text', ...
 */

// ─── Layout ──────────────────────────────────────────────────────────────────

/** max-w-[1200px] centred with horizontal padding */
export const MK_CONTAINER = 'mx-auto w-full max-w-[1200px] px-6 max-[768px]:px-4'

// ─── Typography ──────────────────────────────────────────────────────────────

/** All-caps label above section headings */
export const MK_EYEBROW =
  'block font-[family-name:var(--mk-font-body)] text-xs font-semibold tracking-[0.18em] uppercase text-[var(--mk-text-muted)] mb-4'

// ─── Buttons (base + modifiers) ───────────────────────────────────────────────

/** Base button – never used standalone, always combined with a variant below */
export const MK_BTN =
  'inline-flex items-center justify-center gap-2 h-[52px] px-6 font-[family-name:var(--mk-font-body)] text-[15.5px] font-semibold rounded-[999px] transition-[transform,background,box-shadow,color,border-color,opacity] duration-150 ease-[ease] whitespace-nowrap'

/** Dark filled pill button */
export const MK_BTN_PRIMARY =
  MK_BTN +
  ' bg-[var(--mk-text)] text-white [box-shadow:0_1px_0_rgba(255,255,255,0.06)_inset,0_4px_14px_rgba(0,0,0,0.18)] hover:opacity-[0.92] hover:-translate-y-px'

/** Outlined ghost button */
export const MK_BTN_GHOST =
  MK_BTN +
  ' bg-[var(--mk-surface)] text-[var(--mk-text)] border border-[var(--mk-border)] hover:border-[var(--mk-text)]'

/** White solid button (used inside dark sections) */
export const MK_BTN_WHITE =
  MK_BTN + ' bg-white text-[var(--mk-text)] hover:bg-[#f5f5f5] hover:-translate-y-px'

/** Small size modifier – combine with a variant: `${MK_BTN_PRIMARY} ${MK_BTN_SM}` */
export const MK_BTN_SM = '!h-[42px] !px-[18px] !text-[14.5px]'

// ─── Logo ─────────────────────────────────────────────────────────────────────

/** <Link> wrapper for the logo mark + text */
export const MK_LOGO =
  'inline-flex items-center gap-[10px] font-[family-name:var(--mk-font-display)] font-bold text-[20px] tracking-[-0.02em]'

/** Circular letter-mark */
export const MK_LOGO_MARK =
  'inline-flex w-8 h-8 items-center justify-center rounded-[999px] bg-[var(--mk-text)] text-white font-[family-name:var(--mk-font-display)] font-extrabold text-[17px] tracking-[-0.04em]'

/** "/ Moderator" suffix */
export const MK_LOGO_SUFFIX = 'text-[var(--mk-text-soft)] font-medium'

// ─── AI badge ─────────────────────────────────────────────────────────────────

/** Small pill badge used next to names in feature illustrations */
export const MK_BADGE_AI =
  'ml-1.5 inline-flex items-center gap-1 bg-[var(--mk-text)] text-white text-[9.5px] font-semibold px-1.5 py-0.5 rounded-[999px] uppercase tracking-[0.06em]'

// ─── Accent text ──────────────────────────────────────────────────────────────

/** De-emphasised span inside h1 headlines */
export const MK_ACCENT = 'text-[var(--mk-text-muted)] font-bold'
