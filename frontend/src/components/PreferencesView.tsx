import { Card } from './Card'
import { DECKS, FELTS, usePrefs } from '../prefs'

export function PreferencesView() {
  const { deckId, feltId, setDeckId, setFeltId } = usePrefs()

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-10">
      <div>
        <h2 className="font-display text-2xl text-ink">Preferences</h2>
        <p className="mt-1 text-sm text-muted">Customise your board — saved on this device.</p>
      </div>

      <section>
        <h3 className="mb-3 font-display text-lg text-ink">Card deck</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {DECKS.map((d) => (
            <button
              key={d.id}
              onClick={() => setDeckId(d.id)}
              className={`flex flex-col items-center gap-3 rounded-xl border p-4 transition ${
                deckId === d.id ? 'border-accent ring-1 ring-accent/40' : 'border-line hover:border-muted'
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

      <section>
        <h3 className="mb-3 font-display text-lg text-ink">Felt</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {FELTS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFeltId(f.id)}
              className={`flex flex-col items-center gap-2 rounded-xl border p-3 transition ${
                feltId === f.id ? 'border-accent ring-1 ring-accent/40' : 'border-line hover:border-muted'
              }`}
            >
              <div
                className="h-16 w-full rounded-lg ring-1 ring-black/30"
                style={{ background: `radial-gradient(ellipse at 50% 42%, ${f.core}, ${f.edge} 80%)` }}
              />
              <span className={`text-xs ${feltId === f.id ? 'text-accent' : 'text-muted'}`}>{f.name}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
