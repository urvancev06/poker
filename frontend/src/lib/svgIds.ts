// Inline SVG ids inside a cloned element. A clone carries the same gradient and clipPath ids
// as its original, and its url(#...) references stop painting once the original is gone (a
// folded card back turned into a black wireframe). Renaming the clone's ids, and every
// reference to them, gives it its own. Pure (the string half); the motion hook walks the DOM.

/**
 * `value` (an attribute: fill, clip-path, style, href ...) with each reference to one of
 * `ids` pointed at `id + suffix`: `url(#id)` (quoted or not) and a bare `#id` href.
 * References to other ids are left alone.
 */
export function suffixIdRefs(value: string, ids: ReadonlySet<string>, suffix: string): string {
  if (!value.includes('#')) return value
  const bare = /^#(.+)$/.exec(value.trim())
  if (bare && ids.has(bare[1])) return `#${bare[1]}${suffix}`
  return value.replace(/url\(\s*(['"]?)#([^'")\s]+)\1\s*\)/g, (m, q: string, id: string) => (ids.has(id) ? `url(${q}#${id}${suffix}${q})` : m))
}

/** Give every id inside `root` (a detached clone) a suffix, and rewrite references to them. */
export function suffixIds(root: Element, suffix: string): void {
  const owners = root.querySelectorAll('[id]')
  if (!owners.length) return
  const ids = new Set<string>()
  owners.forEach((el) => {
    ids.add(el.id)
    el.id = `${el.id}${suffix}`
  })
  for (const el of [root, ...root.querySelectorAll('*')]) {
    for (const a of el.attributes) {
      const next = suffixIdRefs(a.value, ids, suffix)
      if (next !== a.value) a.value = next
    }
  }
}
