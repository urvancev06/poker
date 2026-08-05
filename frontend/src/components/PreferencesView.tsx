import { Card } from './Card'
import { DECKS } from '../lib/decks'
import { usePrefs } from '../lib/prefsContext'

export function PreferencesView() {
  const { deckId, setDeckId, visibility, setVisibility } = usePrefs()

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-10">
      <div>
        <h2 className="font-display text-2xl text-ink">Preferences</h2>
        <p className="mt-1 text-sm text-muted">Customise your board — saved on this device.</p>
      </div>

      <section>
        <h3 className="mb-1 font-display text-lg text-ink">Opponent visibility</h3>
        <p className="mb-3 text-sm text-muted">
          Display only — it never changes how the bots play or what the coach computes.
          Work down the list as you stop needing the training wheels.
        </p>
        <div className="space-y-2">
          {([
            ['labeled', 'Labeled', 'Each seat shows its archetype name. Easiest.'],
            ['hud', 'HUD', 'Shows observed VPIP/PFR once there is a big enough sample — read the player, not the label.'],
            ['live', 'Live', 'Nothing but the action. Closest to a real table.'],
          ] as const).map(([id, label, hint]) => (
            <button
              key={id}
              onClick={() => setVisibility(id)}
              className={`flex w-full items-baseline gap-3 rounded-lg border px-3 py-2 text-left ${
                visibility === id ? 'border-accent bg-accent/10' : 'border-line'
              }`}
            >
              <span className="w-16 shrink-0 text-sm text-ink">{label}</span>
              <span className="text-[11px] text-muted">{hint}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 font-display text-lg text-ink">Card deck</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {DECKS.map((d) => (
            <button
              key={d.id}
              onClick={() => setDeckId(d.id)}
              className={`flex flex-col items-center gap-3 rounded-lg border p-4 transition ${
                deckId === d.id ? 'border-accent ring-1 ring-accent/40' : 'border-line hover:border-faint'
              }`}
            >
              <div className="flex items-end gap-1">
                <Card card="As" deckId={d.id} width={46} />
                <Card card="Kh" deckId={d.id} width={46} />
              </div>
              <span className={`text-xs ${deckId === d.id ? 'text-accent' : 'text-muted'}`}>{d.name}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
