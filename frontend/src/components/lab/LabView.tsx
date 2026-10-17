/**
 * Lab: two tools under one title.
 *   Bot lab       set a bot's strategy, simulate, and read where its stats land against
 *                 their target bands (BotLab).
 *   CFR on Kuhn   train a real solver on a toy game whose answer is known, and watch it
 *                 converge (CfrLab).
 *
 *   <LabView />
 *
 * Both tools stay mounted (React <Activity>): switching never loses a lineup, a knob, an
 * iteration count or a result, and a run in flight lands even while the other tool is
 * shown. The hidden tool's effects pause and its dock hides with it.
 */
import { Activity, useState } from 'react'
import { BP, useViewportSize } from '../../lib/breakpoints'
import { useSpaceAvoid } from '../../lib/spaceAvoid'
import { PageHeader } from '../../ui/PageHeader'
import { Segmented } from '../../ui/Segmented'
import { BotLab } from './BotLab'
import { CfrLab } from './CfrLab'
import './LabView.css'

type Tool = 'bots' | 'cfr'

const TOOLS = [
  { value: 'bots', label: 'Bot lab' },
  { value: 'cfr', label: 'CFR on Kuhn' },
] as const

/** Keeps stars out from under the column and the dock. Its own component, so a resize
 *  re-renders only this. */
function SpaceColumn() {
  const { w, h } = useViewportSize()
  const phone = w < BP.sm
  const col = Math.min(w, 1120) - (phone ? 0 : 56)
  const rect = w > 0 ? (phone ? { x: 0, y: 120, w, h: h - 120 } : { x: (w - col) / 2, y: 0, w: col, h }) : null
  useSpaceAvoid('lab', [rect])
  return null
}

export function LabView() {
  const [tool, setTool] = useState<Tool>('bots')
  return (
    <div className="lab mx-auto max-w-[1120px] px-10 pt-[100px] pb-[60px] max-sm:px-4 max-sm:pt-[76px] max-sm:pb-10">
      <SpaceColumn />
      <PageHeader title="Lab" controls={<Segmented className="lab-tools" label="Tool" value={tool} onChange={setTool} options={TOOLS} />} />
      <Activity mode={tool === 'bots' ? 'visible' : 'hidden'}>
        <BotLab />
      </Activity>
      <Activity mode={tool === 'cfr' ? 'visible' : 'hidden'}>
        <CfrLab />
      </Activity>
    </div>
  )
}
