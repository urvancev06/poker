// Side-by-side heading-style preview so the user can pick the feel. Each style
// only changes the display font (--font-display); body text stays Hanken Grotesk.
// Picking one applies it everywhere instantly and persists in localStorage —
// fully reversible, no rebuild.

export type TypeStyle = string

const STACKS = {
  fraunces: '"Fraunces", ui-serif, Georgia, serif',
  hanken: '"Hanken Grotesk", ui-sans-serif, system-ui, sans-serif',
  spaceGrotesk: '"Space Grotesk", ui-sans-serif, system-ui, sans-serif',
  playfair: '"Playfair Display", ui-serif, Georgia, serif',
  spaceMono: '"Space Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
}

export interface TypeStyleDef {
  id: TypeStyle
  name: string
  note: string
  font: string
  tracking: string
}

export const TYPE_STYLES: TypeStyleDef[] = [
  { id: 'editorial', name: 'Editorial', note: 'Characterful serif (default).', font: STACKS.fraunces, tracking: '' },
  { id: 'clean', name: 'Clean', note: 'Minimal grotesk, matches the UI.', font: STACKS.hanken, tracking: '-tracking-tight' },
  { id: 'modern', name: 'Modern', note: 'Geometric, techy.', font: STACKS.spaceGrotesk, tracking: '-tracking-tight' },
  { id: 'elegant', name: 'Elegant', note: 'High-contrast display serif.', font: STACKS.playfair, tracking: '' },
  { id: 'mono', name: 'Mono', note: 'Monospace, terminal/quant feel.', font: STACKS.spaceMono, tracking: '-tracking-tight' },
]

const DEFAULT_STYLE = TYPE_STYLES[0]

export function applyTypeStyle(id: TypeStyle) {
  const style = TYPE_STYLES.find((s) => s.id === id) ?? DEFAULT_STYLE
  document.documentElement.style.setProperty('--font-display', style.font)
  try {
    localStorage.setItem('poker-type', style.id)
  } catch {
    /* ignore storage failures */
  }
}

export function loadTypeStyle(): TypeStyle {
  try {
    const saved = localStorage.getItem('poker-type')
    return TYPE_STYLES.some((s) => s.id === saved) ? (saved as TypeStyle) : DEFAULT_STYLE.id
  } catch {
    return DEFAULT_STYLE.id
  }
}

function Sample({ tracking }: { tracking: string }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <img src="/brand/urvancev-logo-white.svg" alt="" className="h-6 w-6 opacity-90" />
        <span className={`font-display text-lg text-ink ${tracking}`}>Poker</span>
      </div>
      <h3 className={`font-display text-2xl text-ink ${tracking}`}>My stats</h3>
      <div className="flex gap-2">
        <div className="rounded-lg border border-line bg-bg2/70 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-muted">VPIP</div>
          <div className="text-xl font-bold tabular-nums text-win">23</div>
        </div>
        <div className="rounded-lg border border-line bg-bg2/70 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-muted">Net</div>
          <div className="text-xl font-bold tabular-nums text-accent">+4.2</div>
        </div>
      </div>
    </div>
  )
}

export function StylePreview({
  active,
  onApply,
}: {
  active: TypeStyle
  onApply: (s: TypeStyle) => void
}) {
  return (
    <div className="mx-auto max-w-5xl pb-10">
      <h2 className="font-display text-2xl text-ink">Type &amp; feel</h2>
      <p className="mb-6 mt-1 text-sm text-muted">
        Five heading treatments. Pick one — it applies everywhere instantly and is reversible. (Body
        text stays Hanken Grotesk; only the display font changes.)
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TYPE_STYLES.map((s) => (
          <div
            key={s.id}
            className={`flex flex-col gap-4 rounded-2xl border p-5 transition ${
              active === s.id ? 'border-accent ring-1 ring-accent/40' : 'border-line'
            }`}
            style={{ ['--font-display' as string]: s.font }}
          >
            <div className="flex items-baseline justify-between">
              <span className="font-display text-base text-ink">{s.name}</span>
              {active === s.id && (
                <span className="text-[11px] uppercase tracking-wider text-accent">Active</span>
              )}
            </div>
            <p className="-mt-3 text-xs text-muted">{s.note}</p>

            <Sample tracking={s.tracking} />

            <button
              onClick={() => onApply(s.id)}
              disabled={active === s.id}
              className="mt-1 w-full rounded-lg border border-line px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink transition hover:border-accent disabled:opacity-40"
            >
              {active === s.id ? 'In use' : `Use ${s.name}`}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
