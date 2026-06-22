// A temporary side-by-side type/contrast preview so the user can pick the feel.
// Both treatments use fonts already bundled (no new deps). Picking one sets a
// CSS variable override (--font-display) persisted in localStorage — fully
// reversible, no rebuild. Editorial = Fraunces serif headings (current);
// Clean = Hanken Grotesk headings (more minimal/modern).

export type TypeStyle = 'editorial' | 'clean'

const FRAUNCES = '"Fraunces", ui-serif, Georgia, serif'
const HANKEN = '"Hanken Grotesk", ui-sans-serif, system-ui, sans-serif'

export function applyTypeStyle(style: TypeStyle) {
  const root = document.documentElement
  root.style.setProperty('--font-display', style === 'clean' ? HANKEN : FRAUNCES)
  try {
    localStorage.setItem('poker-type', style)
  } catch {
    /* ignore storage failures */
  }
}

export function loadTypeStyle(): TypeStyle {
  try {
    return localStorage.getItem('poker-type') === 'clean' ? 'clean' : 'editorial'
  } catch {
    return 'editorial'
  }
}

function Sample({ headingTracking }: { headingTracking: string }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <img src="/brand/urvancev-logo-white.svg" alt="" className="h-7 w-7 opacity-90" />
        <span className={`font-display text-xl text-ink ${headingTracking}`}>Poker</span>
      </div>

      <h3 className={`font-display text-3xl text-ink ${headingTracking}`}>My stats</h3>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-line bg-bg2/70 p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted">VPIP</div>
          <div className="text-3xl font-bold tabular-nums text-win">23</div>
          <div className="text-[11px] text-muted tabular-nums">target 22–26</div>
        </div>
        <div className="rounded-xl border border-line bg-bg2/70 p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted">Net</div>
          <div className="text-3xl font-bold tabular-nums text-accent">+4.2</div>
          <div className="text-[11px] text-muted">bb/100</div>
        </div>
      </div>

      <p className="text-sm leading-relaxed text-muted">
        Two pair, ~93% equity vs Nit’s modelled range — you’re way ahead; raise to get value,
        don’t just call. Computed math, not a solver number.
      </p>

      <div className="flex items-center gap-3">
        <button className="rounded-lg bg-accent px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-accent-ink">
          Raise to 8
        </button>
        <div className="flex w-36 flex-col items-center gap-1 rounded-xl bg-bg2 px-3 py-2 ring-1 ring-accent/40">
          <div className="flex w-full justify-between text-[11px] uppercase tracking-wide">
            <span className="font-semibold text-muted">SB</span>
            <span className="text-accent">You</span>
          </div>
          <div className="w-full text-left text-lg font-bold tabular-nums text-ink">235</div>
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
  const cols: Array<{ key: TypeStyle; title: string; note: string; font: string; tracking: string }> = [
    {
      key: 'editorial',
      title: 'Editorial',
      note: 'Fraunces serif headings — warm, characterful (current).',
      font: FRAUNCES,
      tracking: '',
    },
    {
      key: 'clean',
      title: 'Clean',
      note: 'Hanken Grotesk headings — minimal, modern, less templated.',
      font: HANKEN,
      tracking: '-tracking-tight',
    },
  ]

  return (
    <div className="mx-auto max-w-5xl pb-10">
      <h2 className="font-display text-2xl text-ink">Type &amp; feel</h2>
      <p className="mb-6 mt-1 text-sm text-muted">
        Same screen, two heading treatments. Pick one — it applies everywhere instantly and is
        reversible. (Body text stays Hanken Grotesk either way; only the display font changes.)
      </p>

      <div className="grid gap-5 md:grid-cols-2">
        {cols.map((c) => (
          <div
            key={c.key}
            className={`rounded-2xl border p-6 transition ${
              active === c.key ? 'border-accent ring-1 ring-accent/40' : 'border-line'
            }`}
            style={{ ['--font-display' as string]: c.font }}
          >
            <div className="mb-1 flex items-baseline justify-between">
              <span className="font-display text-lg text-ink">{c.title}</span>
              {active === c.key && (
                <span className="text-[11px] uppercase tracking-wider text-accent">Active</span>
              )}
            </div>
            <p className="mb-5 text-xs text-muted">{c.note}</p>

            <Sample headingTracking={c.tracking} />

            <button
              onClick={() => onApply(c.key)}
              disabled={active === c.key}
              className="mt-6 w-full rounded-lg border border-line px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink transition hover:border-accent disabled:opacity-40"
            >
              {active === c.key ? 'In use' : `Use ${c.title}`}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
