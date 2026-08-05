// Wording for one logged action. Lives outside ActionLog.tsx so that file
// exports only its component (Fast Refresh needs component-only modules).

import type { ActionLogEntry } from '../api'

export function actionText(a: ActionLogEntry): string {
  switch (a.action) {
    case 'fold':
      return 'folds'
    case 'check':
      return 'checks'
    case 'call':
      return 'calls'
    case 'bet':
      return `bets ${a.to_amount}`
    case 'raise':
      return `raises to ${a.to_amount}`
    default:
      return a.action
  }
}
