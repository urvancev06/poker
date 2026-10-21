// Real coach answers captured from the backend (scratchpad/samples/coach_verdict_*.json and
// spot_*.json; generated, duplicates dropped). Used by the coach tests and the dev-only
// harness (coach-harness.html); never imported by the app itself.

import type { Coaching } from '../api'

export interface CoachSample {
  name: string
  heroCards: string[]
  board: string[]
  /** Position by seat index (state.seats[i].position). */
  positions: string[]
  heroSeat: number
  coach: Coaching
}

export const COACH_SAMPLES: readonly CoachSample[] = [
  {
    "name": "coach_verdict_bet_for_value",
    "heroCards": [
      "Ah",
      "8d"
    ],
    "board": [
      "8h",
      "Jc",
      "Ad"
    ],
    "positions": [
      "SB",
      "BB",
      "UTG",
      "MP",
      "CO",
      "BTN"
    ],
    "heroSeat": 2,
    "coach": {
      "hand_label": "two pair",
      "made_tier": "TWO_PAIR",
      "draws": [],
      "equity_pct": 78,
      "realized_equity_pct": 72,
      "realization_pct": 92,
      "win_pct": 77,
      "tie_pct": 3,
      "lose_pct": 20,
      "to_call": 0,
      "pot": 15,
      "required_equity_pct": null,
      "required_direct_pct": null,
      "implied_note": "",
      "pot_odds": null,
      "call_ev": null,
      "in_position": true,
      "action_closed": false,
      "players_behind": 0,
      "villains": [
        {
          "seat": 0,
          "archetype": "Calling Station",
          "combos": 493,
          "description": "Calling Station, preflop range → ~top 37.2% (493 combos)",
          "bluff_pct": 30.8
        },
        {
          "seat": 1,
          "archetype": "Maniac",
          "combos": 644,
          "description": "Maniac, preflop range → ~top 48.6% (644 combos)",
          "bluff_pct": 37.9
        }
      ],
      "verdict": "Bet for value.",
      "rationale": "You have two pair (~78% equity) — bet to get value while ahead.",
      "tone": "good",
      "basis": [
        "Hand classification and equity are computed (Monte Carlo, treys).",
        "Equity realization (raw → realized) is a rough position/hand-type/street estimate, not a solver output.",
        "Villain ranges are action-conditioned: the archetype range narrowed by their bets/calls this hand (bluff rates measured from the bots).",
        "For exact GTO frequencies, confirm in GTO Wizard."
      ]
    }
  },
  {
    "name": "coach_verdict_call",
    "heroCards": [
      "Kd",
      "Ac"
    ],
    "board": [],
    "positions": [
      "SB",
      "BB",
      "UTG",
      "MP",
      "CO",
      "BTN"
    ],
    "heroSeat": 5,
    "coach": {
      "hand_label": "high card",
      "made_tier": "HIGH_CARD",
      "draws": [],
      "equity_pct": 66,
      "realized_equity_pct": 46,
      "realization_pct": 70,
      "win_pct": 64,
      "tie_pct": 2,
      "lose_pct": 33,
      "to_call": 5,
      "pot": 8,
      "required_equity_pct": 38.5,
      "required_direct_pct": 38.5,
      "implied_note": "",
      "pot_odds": "1.6 : 1",
      "call_ev": 1.0,
      "in_position": true,
      "action_closed": false,
      "players_behind": 2,
      "villains": [
        {
          "seat": 4,
          "archetype": "Maniac",
          "combos": 733,
          "description": "Maniac, preflop range → ~top 55.3% (733 combos)",
          "bluff_pct": 0.0
        }
      ],
      "verdict": "Call.",
      "rationale": "~66% raw → ~46% realized in position vs the ~38% you need to call. Note: 2 still to act behind you, so calling doesn't close the action.",
      "tone": "good",
      "basis": [
        "Hand classification and equity are computed (Monte Carlo, treys).",
        "Pot odds and required equity are exact arithmetic.",
        "Equity realization (raw → realized) is a rough position/hand-type/street estimate, not a solver output.",
        "Villain ranges are action-conditioned: the archetype range narrowed by their bets/calls this hand (bluff rates measured from the bots).",
        "For exact GTO frequencies, confirm in GTO Wizard."
      ]
    }
  },
  {
    "name": "coach_verdict_check",
    "heroCards": [
      "Kd",
      "6s"
    ],
    "board": [
      "Jh",
      "2d",
      "3h"
    ],
    "positions": [
      "SB",
      "BB",
      "UTG",
      "MP",
      "CO",
      "BTN"
    ],
    "heroSeat": 3,
    "coach": {
      "hand_label": "high card",
      "made_tier": "HIGH_CARD",
      "draws": [],
      "equity_pct": 13,
      "realized_equity_pct": 10,
      "realization_pct": 78,
      "win_pct": 12,
      "tie_pct": 2,
      "lose_pct": 86,
      "to_call": 0,
      "pot": 15,
      "required_equity_pct": null,
      "required_direct_pct": null,
      "implied_note": "",
      "pot_odds": null,
      "call_ev": null,
      "in_position": true,
      "action_closed": false,
      "players_behind": 0,
      "villains": [
        {
          "seat": 0,
          "archetype": "LAG",
          "combos": 361,
          "description": "LAG, preflop range → ~top 27.2% (361 combos)",
          "bluff_pct": 51.0
        },
        {
          "seat": 1,
          "archetype": "Calling Station",
          "combos": 551,
          "description": "Calling Station, preflop range → ~top 41.6% (551 combos)",
          "bluff_pct": 54.4
        }
      ],
      "verdict": "Check.",
      "rationale": "No made hand and no real draw — check; don't bet without a reason.",
      "tone": "neutral",
      "basis": [
        "Hand classification and equity are computed (Monte Carlo, treys).",
        "Equity realization (raw → realized) is a rough position/hand-type/street estimate, not a solver output.",
        "Villain ranges are action-conditioned: the archetype range narrowed by their bets/calls this hand (bluff rates measured from the bots).",
        "For exact GTO frequencies, confirm in GTO Wizard."
      ]
    }
  },
  {
    "name": "coach_verdict_clear_call",
    "heroCards": [
      "Kd",
      "Ad"
    ],
    "board": [
      "6s",
      "6h",
      "8d"
    ],
    "positions": [
      "SB",
      "BB",
      "UTG",
      "MP",
      "CO",
      "BTN"
    ],
    "heroSeat": 0,
    "coach": {
      "hand_label": "a pair + backdoor flush draw",
      "made_tier": "PAIR",
      "draws": [
        "backdoor_flush_draw"
      ],
      "equity_pct": 62,
      "realized_equity_pct": 54,
      "realization_pct": 87,
      "win_pct": 60,
      "tie_pct": 4,
      "lose_pct": 36,
      "to_call": 9,
      "pot": 21,
      "required_equity_pct": 30.0,
      "required_direct_pct": 30.0,
      "implied_note": "",
      "pot_odds": "2.3 : 1",
      "call_ev": 7.1,
      "in_position": false,
      "action_closed": false,
      "players_behind": 0,
      "villains": [
        {
          "seat": 5,
          "archetype": "Maniac",
          "combos": 662,
          "description": "Maniac, c-bet flop → ~top 49.9% (662 combos)",
          "bluff_pct": 0.0
        }
      ],
      "verdict": "Clear call.",
      "rationale": "~62% raw → ~54% realized out of position vs the ~30% you need to call. Comfortably ahead of the price.",
      "tone": "good",
      "basis": [
        "Hand classification and equity are computed (Monte Carlo, treys).",
        "Pot odds and required equity are exact arithmetic.",
        "Equity realization (raw → realized) is a rough position/hand-type/street estimate, not a solver output.",
        "Villain ranges are action-conditioned: the archetype range narrowed by their bets/calls this hand (bluff rates measured from the bots).",
        "For exact GTO frequencies, confirm in GTO Wizard."
      ]
    }
  },
  {
    "name": "coach_verdict_close__call_or_fold",
    "heroCards": [
      "Qc",
      "2d"
    ],
    "board": [
      "3d",
      "6d",
      "3c"
    ],
    "positions": [
      "SB",
      "BB",
      "UTG",
      "MP",
      "CO",
      "BTN"
    ],
    "heroSeat": 2,
    "coach": {
      "hand_label": "a pair + backdoor flush draw",
      "made_tier": "PAIR",
      "draws": [
        "backdoor_flush_draw"
      ],
      "equity_pct": 35,
      "realized_equity_pct": 33,
      "realization_pct": 93,
      "win_pct": 31,
      "tie_pct": 8,
      "lose_pct": 61,
      "to_call": 8,
      "pot": 19,
      "required_equity_pct": 29.6,
      "required_direct_pct": 29.6,
      "implied_note": "",
      "pot_odds": "2.4 : 1",
      "call_ev": 0.8,
      "in_position": true,
      "action_closed": false,
      "players_behind": 0,
      "villains": [
        {
          "seat": 1,
          "archetype": "Maniac",
          "combos": 713,
          "description": "Maniac, c-bet flop → ~top 53.8% (713 combos)",
          "bluff_pct": 0.0
        }
      ],
      "verdict": "Close — call or fold.",
      "rationale": "~35% raw → ~33% realized in position vs the ~30% you need to call. Borderline; lean on your read of how often they bluff this line. Confirm in GTO Wizard.",
      "tone": "close",
      "basis": [
        "Hand classification and equity are computed (Monte Carlo, treys).",
        "Pot odds and required equity are exact arithmetic.",
        "Equity realization (raw → realized) is a rough position/hand-type/street estimate, not a solver output.",
        "Villain ranges are action-conditioned: the archetype range narrowed by their bets/calls this hand (bluff rates measured from the bots).",
        "For exact GTO frequencies, confirm in GTO Wizard."
      ]
    }
  },
  {
    "name": "coach_verdict_close_preflop",
    "heroCards": [
      "8h",
      "As"
    ],
    "board": [],
    "positions": [
      "SB",
      "BB",
      "UTG",
      "MP",
      "CO",
      "BTN"
    ],
    "heroSeat": 4,
    "coach": {
      "hand_label": "high card",
      "made_tier": "HIGH_CARD",
      "draws": [],
      "equity_pct": 57,
      "realized_equity_pct": 38,
      "realization_pct": 66,
      "win_pct": 55,
      "tie_pct": 4,
      "lose_pct": 41,
      "to_call": 5,
      "pot": 8,
      "required_equity_pct": 38.5,
      "required_direct_pct": 38.5,
      "implied_note": "",
      "pot_odds": "1.6 : 1",
      "call_ev": -0.1,
      "in_position": true,
      "action_closed": false,
      "players_behind": 3,
      "villains": [
        {
          "seat": 3,
          "archetype": "Maniac",
          "combos": 756,
          "description": "Maniac, preflop range → ~top 57.0% (756 combos)",
          "bluff_pct": 0.0
        }
      ],
      "verdict": "Close — call or fold.",
      "rationale": "~57% raw → ~38% realized in position vs the ~38% you need to call. Borderline; lean on your read of how often they bluff this line. Confirm in GTO Wizard. Note: 3 still to act behind you, so calling doesn't close the action.",
      "tone": "close",
      "basis": [
        "Hand classification and equity are computed (Monte Carlo, treys).",
        "Pot odds and required equity are exact arithmetic.",
        "Equity realization (raw → realized) is a rough position/hand-type/street estimate, not a solver output.",
        "Villain ranges are action-conditioned: the archetype range narrowed by their bets/calls this hand (bluff rates measured from the bots).",
        "For exact GTO frequencies, confirm in GTO Wizard."
      ]
    }
  },
  {
    "name": "coach_verdict_fold",
    "heroCards": [
      "Kd",
      "Ac"
    ],
    "board": [
      "2c",
      "Qs",
      "8h"
    ],
    "positions": [
      "SB",
      "BB",
      "UTG",
      "MP",
      "CO",
      "BTN"
    ],
    "heroSeat": 5,
    "coach": {
      "hand_label": "two overcards",
      "made_tier": "HIGH_CARD",
      "draws": [
        "overcards"
      ],
      "equity_pct": 28,
      "realized_equity_pct": 24,
      "realization_pct": 85,
      "win_pct": 19,
      "tie_pct": 18,
      "lose_pct": 63,
      "to_call": 22,
      "pot": 58,
      "required_equity_pct": 27.5,
      "required_direct_pct": 27.5,
      "implied_note": "",
      "pot_odds": "2.6 : 1",
      "call_ev": -3.0,
      "in_position": true,
      "action_closed": false,
      "players_behind": 0,
      "villains": [
        {
          "seat": 1,
          "archetype": "TAG",
          "combos": 47,
          "description": "TAG, 3-bet pre + c-bet flop → ~top 3.5% (47 combos)",
          "bluff_pct": 23.4
        }
      ],
      "verdict": "Fold.",
      "rationale": "~28% raw → ~24% realized in position vs the ~28% you need to call. Below the price once you account for how much of it you'll actually realize.",
      "tone": "fold",
      "basis": [
        "Hand classification and equity are computed (Monte Carlo, treys).",
        "Pot odds and required equity are exact arithmetic.",
        "Equity realization (raw → realized) is a rough position/hand-type/street estimate, not a solver output.",
        "Villain ranges are action-conditioned: the archetype range narrowed by their bets/calls this hand (bluff rates measured from the bots).",
        "For exact GTO frequencies, confirm in GTO Wizard."
      ]
    }
  },
  {
    "name": "coach_verdict_fold_preflop",
    "heroCards": [
      "Qs",
      "4d"
    ],
    "board": [],
    "positions": [
      "SB",
      "BB",
      "UTG",
      "MP",
      "CO",
      "BTN"
    ],
    "heroSeat": 5,
    "coach": {
      "hand_label": "high card",
      "made_tier": "HIGH_CARD",
      "draws": [],
      "equity_pct": 40,
      "realized_equity_pct": 28,
      "realization_pct": 70,
      "win_pct": 37,
      "tie_pct": 7,
      "lose_pct": 56,
      "to_call": 5,
      "pot": 8,
      "required_equity_pct": 38.5,
      "required_direct_pct": 38.5,
      "implied_note": "",
      "pot_odds": "1.6 : 1",
      "call_ev": -1.3,
      "in_position": true,
      "action_closed": false,
      "players_behind": 2,
      "villains": [
        {
          "seat": 4,
          "archetype": "Maniac",
          "combos": 767,
          "description": "Maniac, preflop range → ~top 57.8% (767 combos)",
          "bluff_pct": 0.0
        }
      ],
      "verdict": "Fold.",
      "rationale": "~40% raw → ~28% realized in position vs the ~38% you need to call. Below the price once you account for how much of it you'll actually realize. Note: 2 still to act behind you, so calling doesn't close the action.",
      "tone": "fold",
      "basis": [
        "Hand classification and equity are computed (Monte Carlo, treys).",
        "Pot odds and required equity are exact arithmetic.",
        "Equity realization (raw → realized) is a rough position/hand-type/street estimate, not a solver output.",
        "Villain ranges are action-conditioned: the archetype range narrowed by their bets/calls this hand (bluff rates measured from the bots).",
        "For exact GTO frequencies, confirm in GTO Wizard."
      ]
    }
  },
  {
    "name": "coach_verdict_raise_for_value",
    "heroCards": [
      "Ad",
      "Jh"
    ],
    "board": [
      "Qc",
      "Kd",
      "As"
    ],
    "positions": [
      "SB",
      "BB",
      "UTG",
      "MP",
      "CO",
      "BTN"
    ],
    "heroSeat": 0,
    "coach": {
      "hand_label": "a pair + gutshot",
      "made_tier": "PAIR",
      "draws": [
        "gutshot"
      ],
      "equity_pct": 78,
      "realized_equity_pct": 66,
      "realization_pct": 84,
      "win_pct": 73,
      "tie_pct": 10,
      "lose_pct": 17,
      "to_call": 17,
      "pot": 40,
      "required_equity_pct": 29.8,
      "required_direct_pct": 29.8,
      "implied_note": "",
      "pot_odds": "2.4 : 1",
      "call_ev": 20.4,
      "in_position": false,
      "action_closed": false,
      "players_behind": 1,
      "villains": [
        {
          "seat": 5,
          "archetype": "Maniac",
          "combos": 517,
          "description": "Maniac, c-bet flop → ~top 39.0% (517 combos)",
          "bluff_pct": 8.5
        }
      ],
      "verdict": "Raise for value.",
      "rationale": "a pair + gutshot, ~78% vs Maniac's modelled range — well ahead; raise to get value rather than just call.",
      "tone": "good",
      "basis": [
        "Hand classification and equity are computed (Monte Carlo, treys).",
        "Pot odds and required equity are exact arithmetic.",
        "Equity realization (raw → realized) is a rough position/hand-type/street estimate, not a solver output.",
        "Villain ranges are action-conditioned: the archetype range narrowed by their bets/calls this hand (bluff rates measured from the bots).",
        "For exact GTO frequencies, confirm in GTO Wizard."
      ]
    }
  },
  {
    "name": "coach_verdict_semibluff_or_check",
    "heroCards": [
      "4s",
      "Qs"
    ],
    "board": [
      "2h",
      "3c",
      "9c",
      "5c"
    ],
    "positions": [
      "SB",
      "BB",
      "UTG",
      "MP",
      "CO",
      "BTN"
    ],
    "heroSeat": 3,
    "coach": {
      "hand_label": "open-ended straight draw",
      "made_tier": "HIGH_CARD",
      "draws": [
        "open_ended_straight_draw"
      ],
      "equity_pct": 18,
      "realized_equity_pct": 17,
      "realization_pct": 95,
      "win_pct": 17,
      "tie_pct": 1,
      "lose_pct": 82,
      "to_call": 0,
      "pot": 48,
      "required_equity_pct": null,
      "required_direct_pct": null,
      "implied_note": "",
      "pot_odds": null,
      "call_ev": null,
      "in_position": false,
      "action_closed": false,
      "players_behind": 0,
      "villains": [
        {
          "seat": 5,
          "archetype": "TAG",
          "combos": 122,
          "description": "TAG, c-bet flop → ~top 9.2% (122 combos)",
          "bluff_pct": 0.0
        }
      ],
      "verdict": "Semi-bluff or check.",
      "rationale": "A draw can bet (fold equity now + outs if called), or take a free card — both are fine.",
      "tone": "neutral",
      "basis": [
        "Hand classification and equity are computed (Monte Carlo, treys).",
        "Equity realization (raw → realized) is a rough position/hand-type/street estimate, not a solver output.",
        "Villain ranges are action-conditioned: the archetype range narrowed by their bets/calls this hand (bluff rates measured from the bots).",
        "For exact GTO frequencies, confirm in GTO Wizard."
      ]
    }
  },
  {
    "name": "coach_verdict_thin_value_bet_or_check",
    "heroCards": [
      "Qh",
      "Kc"
    ],
    "board": [
      "Th",
      "Qd",
      "2s"
    ],
    "positions": [
      "SB",
      "BB",
      "UTG",
      "MP",
      "CO",
      "BTN"
    ],
    "heroSeat": 5,
    "coach": {
      "hand_label": "a pair",
      "made_tier": "PAIR",
      "draws": [],
      "equity_pct": 68,
      "realized_equity_pct": 64,
      "realization_pct": 93,
      "win_pct": 66,
      "tie_pct": 6,
      "lose_pct": 29,
      "to_call": 0,
      "pot": 18,
      "required_equity_pct": null,
      "required_direct_pct": null,
      "implied_note": "",
      "pot_odds": null,
      "call_ev": null,
      "in_position": true,
      "action_closed": false,
      "players_behind": 0,
      "villains": [
        {
          "seat": 0,
          "archetype": "Nit",
          "combos": 119,
          "description": "Nit, preflop range → ~top 9.0% (119 combos)",
          "bluff_pct": 6.7
        }
      ],
      "verdict": "Thin value bet, or check.",
      "rationale": "~68% equity in position — a small value bet works; checking is safe.",
      "tone": "neutral",
      "basis": [
        "Hand classification and equity are computed (Monte Carlo, treys).",
        "Equity realization (raw → realized) is a rough position/hand-type/street estimate, not a solver output.",
        "Villain ranges are action-conditioned: the archetype range narrowed by their bets/calls this hand (bluff rates measured from the bots).",
        "For exact GTO frequencies, confirm in GTO Wizard."
      ]
    }
  },
  {
    "name": "spot_facing_allin",
    "heroCards": [
      "8h",
      "2s"
    ],
    "board": [
      "2h",
      "3d",
      "5h",
      "Tc",
      "Jc"
    ],
    "positions": [
      "SB",
      "BB",
      "UTG",
      "MP",
      "CO",
      "BTN"
    ],
    "heroSeat": 5,
    "coach": {
      "hand_label": "a pair",
      "made_tier": "PAIR",
      "draws": [],
      "equity_pct": 1,
      "realized_equity_pct": 1,
      "realization_pct": 100,
      "win_pct": 1,
      "tie_pct": 0,
      "lose_pct": 99,
      "to_call": 67,
      "pot": 1286,
      "required_equity_pct": 5.0,
      "required_direct_pct": 5.0,
      "implied_note": "",
      "pot_odds": "19.2 : 1",
      "call_ev": -52.8,
      "in_position": true,
      "action_closed": true,
      "players_behind": 1,
      "villains": [
        {
          "seat": 1,
          "archetype": "TAG",
          "combos": 96,
          "description": "TAG, raised turn + barreled river → ~top 7.2% (96 combos)",
          "bluff_pct": 3.1
        },
        {
          "seat": 3,
          "archetype": "Calling Station",
          "combos": 409,
          "description": "Calling Station, called turn + called river → ~top 30.8% (409 combos)",
          "bluff_pct": 30.1
        }
      ],
      "verdict": "Fold.",
      "rationale": "~1% equity vs the ~5% you need, and there's no more betting — a pure price decision. You're not being priced in. Note: 1 still to act behind you, so calling doesn't close the action.",
      "tone": "fold",
      "basis": [
        "Hand classification and equity are computed (Monte Carlo, treys).",
        "Pot odds and required equity are exact arithmetic.",
        "Villain ranges are action-conditioned: the archetype range narrowed by their bets/calls this hand (bluff rates measured from the bots).",
        "For exact GTO frequencies, confirm in GTO Wizard."
      ]
    }
  },
  {
    "name": "spot_facing_allin_turn_call",
    "heroCards": [
      "Kh",
      "Ad"
    ],
    "board": [
      "5d",
      "5h",
      "Td",
      "Jc"
    ],
    "positions": [
      "SB",
      "BB",
      "UTG",
      "MP",
      "CO",
      "BTN"
    ],
    "heroSeat": 3,
    "coach": {
      "hand_label": "a pair + gutshot",
      "made_tier": "PAIR",
      "draws": [
        "gutshot"
      ],
      "equity_pct": 26,
      "realized_equity_pct": 26,
      "realization_pct": 100,
      "win_pct": 20,
      "tie_pct": 13,
      "lose_pct": 68,
      "to_call": 47,
      "pot": 546,
      "required_equity_pct": 7.9,
      "required_direct_pct": 7.9,
      "implied_note": "",
      "pot_odds": "11.6 : 1",
      "call_ev": 106.9,
      "in_position": true,
      "action_closed": true,
      "players_behind": 1,
      "villains": [
        {
          "seat": 0,
          "archetype": "LAG",
          "combos": 71,
          "description": "LAG, 3-bet pre + c-bet flop + raised turn → ~top 5.4% (71 combos)",
          "bluff_pct": 0.0
        }
      ],
      "verdict": "Call.",
      "rationale": "~26% equity vs the ~8% you need, and there's no more betting — a pure price decision. You're getting the price. Note: 1 still to act behind you, so calling doesn't close the action.",
      "tone": "good",
      "basis": [
        "Hand classification and equity are computed (Monte Carlo, treys).",
        "Pot odds and required equity are exact arithmetic.",
        "Villain ranges are action-conditioned: the archetype range narrowed by their bets/calls this hand (bluff rates measured from the bots).",
        "For exact GTO frequencies, confirm in GTO Wizard."
      ]
    }
  },
  {
    "name": "spot_flop_draw",
    "heroCards": [
      "6d",
      "5s"
    ],
    "board": [
      "8h",
      "7s",
      "Qs"
    ],
    "positions": [
      "SB",
      "BB",
      "UTG",
      "MP",
      "CO",
      "BTN"
    ],
    "heroSeat": 3,
    "coach": {
      "hand_label": "open-ended straight draw + backdoor flush draw",
      "made_tier": "HIGH_CARD",
      "draws": [
        "open_ended_straight_draw",
        "backdoor_flush_draw"
      ],
      "equity_pct": 38,
      "realized_equity_pct": 38,
      "realization_pct": 100,
      "win_pct": 37,
      "tie_pct": 1,
      "lose_pct": 62,
      "to_call": 21,
      "pot": 53,
      "required_equity_pct": 28.4,
      "required_direct_pct": 28.4,
      "implied_note": "",
      "pot_odds": "2.5 : 1",
      "call_ev": 6.9,
      "in_position": true,
      "action_closed": true,
      "players_behind": 1,
      "villains": [
        {
          "seat": 2,
          "archetype": "Maniac",
          "combos": 483,
          "description": "Maniac, raised flop → ~top 36.4% (483 combos)",
          "bluff_pct": 23.6
        }
      ],
      "verdict": "Call.",
      "rationale": "~38% equity vs the ~28% you need, and there's no more betting — a pure price decision. You're getting the price. Note: 1 still to act behind you, so calling doesn't close the action.",
      "tone": "good",
      "basis": [
        "Hand classification and equity are computed (Monte Carlo, treys).",
        "Pot odds and required equity are exact arithmetic.",
        "Villain ranges are action-conditioned: the archetype range narrowed by their bets/calls this hand (bluff rates measured from the bots).",
        "For exact GTO frequencies, confirm in GTO Wizard."
      ]
    }
  },
  {
    "name": "spot_implied_draw",
    "heroCards": [
      "4d",
      "6d"
    ],
    "board": [
      "2d",
      "7s",
      "Qd"
    ],
    "positions": [
      "SB",
      "BB",
      "UTG",
      "MP",
      "CO",
      "BTN"
    ],
    "heroSeat": 1,
    "coach": {
      "hand_label": "flush draw",
      "made_tier": "HIGH_CARD",
      "draws": [
        "flush_draw"
      ],
      "equity_pct": 40,
      "realized_equity_pct": 39,
      "realization_pct": 99,
      "win_pct": 40,
      "tie_pct": 0,
      "lose_pct": 60,
      "to_call": 26,
      "pot": 61,
      "required_equity_pct": 22.2,
      "required_direct_pct": 29.9,
      "implied_note": "draw — paid off when you complete",
      "pot_odds": "2.3 : 1",
      "call_ev": 8.0,
      "in_position": true,
      "action_closed": false,
      "players_behind": 0,
      "villains": [
        {
          "seat": 0,
          "archetype": "Maniac",
          "combos": 101,
          "description": "Maniac, 3-bet pre + c-bet flop → ~top 7.6% (101 combos)",
          "bluff_pct": 24.8
        }
      ],
      "verdict": "Clear call.",
      "rationale": "~40% raw → ~39% realized in position vs the ~22% you need to call. (price adjusted — draw — paid off when you complete) Comfortably ahead of the price.",
      "tone": "good",
      "basis": [
        "Hand classification and equity are computed (Monte Carlo, treys).",
        "Pot odds and required equity are exact arithmetic.",
        "Equity realization (raw → realized) is a rough position/hand-type/street estimate, not a solver output.",
        "The implied / reverse-implied price adjustment is a conservative estimate — not a solver output.",
        "Villain ranges are action-conditioned: the archetype range narrowed by their bets/calls this hand (bluff rates measured from the bots).",
        "For exact GTO frequencies, confirm in GTO Wizard."
      ]
    }
  },
  {
    "name": "spot_implied_reverse",
    "heroCards": [
      "2d",
      "7h"
    ],
    "board": [
      "Js",
      "2h",
      "Ad"
    ],
    "positions": [
      "SB",
      "BB",
      "UTG",
      "MP",
      "CO",
      "BTN"
    ],
    "heroSeat": 1,
    "coach": {
      "hand_label": "a pair",
      "made_tier": "PAIR",
      "draws": [],
      "equity_pct": 35,
      "realized_equity_pct": 31,
      "realization_pct": 87,
      "win_pct": 35,
      "tie_pct": 1,
      "lose_pct": 64,
      "to_call": 15,
      "pot": 35,
      "required_equity_pct": 41.7,
      "required_direct_pct": 30.0,
      "implied_note": "reverse implied — dominated",
      "pot_odds": "2.3 : 1",
      "call_ev": 0.3,
      "in_position": true,
      "action_closed": false,
      "players_behind": 2,
      "villains": [
        {
          "seat": 0,
          "archetype": "Maniac",
          "combos": 472,
          "description": "Maniac, c-bet flop → ~top 35.6% (472 combos)",
          "bluff_pct": 23.7
        }
      ],
      "verdict": "Fold.",
      "rationale": "~35% raw → ~31% realized in position vs the ~42% you need to call. (price adjusted — reverse implied — dominated) Below the price once you account for how much of it you'll actually realize. Note: 2 still to act behind you, so calling doesn't close the action.",
      "tone": "fold",
      "basis": [
        "Hand classification and equity are computed (Monte Carlo, treys).",
        "Pot odds and required equity are exact arithmetic.",
        "Equity realization (raw → realized) is a rough position/hand-type/street estimate, not a solver output.",
        "The implied / reverse-implied price adjustment is a conservative estimate — not a solver output.",
        "Villain ranges are action-conditioned: the archetype range narrowed by their bets/calls this hand (bluff rates measured from the bots).",
        "For exact GTO frequencies, confirm in GTO Wizard."
      ]
    }
  },
  {
    "name": "spot_implied_set",
    "heroCards": [
      "3s",
      "3c"
    ],
    "board": [],
    "positions": [
      "SB",
      "BB",
      "UTG",
      "MP",
      "CO",
      "BTN"
    ],
    "heroSeat": 5,
    "coach": {
      "hand_label": "pocket 3s",
      "made_tier": "PAIR",
      "draws": [],
      "equity_pct": 31,
      "realized_equity_pct": 22,
      "realization_pct": 71,
      "win_pct": 31,
      "tie_pct": 1,
      "lose_pct": 68,
      "to_call": 5,
      "pot": 13,
      "required_equity_pct": 18.5,
      "required_direct_pct": 27.8,
      "implied_note": "set value, 150 bb behind",
      "pot_odds": "2.6 : 1",
      "call_ev": -1.0,
      "in_position": true,
      "action_closed": false,
      "players_behind": 2,
      "villains": [
        {
          "seat": 3,
          "archetype": "Calling Station",
          "combos": 643,
          "description": "Calling Station, preflop range → ~top 48.5% (643 combos)",
          "bluff_pct": 0.0
        },
        {
          "seat": 4,
          "archetype": "Maniac",
          "combos": 801,
          "description": "Maniac, preflop range → ~top 60.4% (801 combos)",
          "bluff_pct": 0.0
        }
      ],
      "verdict": "Call.",
      "rationale": "~31% raw → ~22% realized in position vs the ~19% you need to call. (price adjusted — set value, 150 bb behind) Note: 2 still to act behind you, so calling doesn't close the action.",
      "tone": "good",
      "basis": [
        "Hand classification and equity are computed (Monte Carlo, treys).",
        "Pot odds and required equity are exact arithmetic.",
        "Equity realization (raw → realized) is a rough position/hand-type/street estimate, not a solver output.",
        "The implied / reverse-implied price adjustment is a conservative estimate — not a solver output.",
        "Villain ranges are action-conditioned: the archetype range narrowed by their bets/calls this hand (bluff rates measured from the bots).",
        "For exact GTO frequencies, confirm in GTO Wizard."
      ]
    }
  },
  {
    "name": "spot_multiway_preflop",
    "heroCards": [
      "Kh",
      "Ad"
    ],
    "board": [],
    "positions": [
      "SB",
      "BB",
      "UTG",
      "MP",
      "CO",
      "BTN"
    ],
    "heroSeat": 3,
    "coach": {
      "hand_label": "high card",
      "made_tier": "HIGH_CARD",
      "draws": [],
      "equity_pct": 38,
      "realized_equity_pct": 26,
      "realization_pct": 69,
      "win_pct": 34,
      "tie_pct": 8,
      "lose_pct": 58,
      "to_call": 10,
      "pot": 37,
      "required_equity_pct": 21.3,
      "required_direct_pct": 21.3,
      "implied_note": "",
      "pot_odds": "3.7 : 1",
      "call_ev": 2.3,
      "in_position": true,
      "action_closed": false,
      "players_behind": 0,
      "villains": [
        {
          "seat": 0,
          "archetype": "LAG",
          "combos": 81,
          "description": "LAG, 3-bet pre → ~top 6.1% (81 combos)",
          "bluff_pct": 0.0
        },
        {
          "seat": 2,
          "archetype": "Maniac",
          "combos": 733,
          "description": "Maniac, preflop range → ~top 55.3% (733 combos)",
          "bluff_pct": 0.0
        }
      ],
      "verdict": "Call.",
      "rationale": "~38% raw → ~26% realized in position vs the ~21% you need to call.",
      "tone": "good",
      "basis": [
        "Hand classification and equity are computed (Monte Carlo, treys).",
        "Pot odds and required equity are exact arithmetic.",
        "Equity realization (raw → realized) is a rough position/hand-type/street estimate, not a solver output.",
        "Villain ranges are action-conditioned: the archetype range narrowed by their bets/calls this hand (bluff rates measured from the bots).",
        "For exact GTO frequencies, confirm in GTO Wizard."
      ]
    }
  },
  {
    "name": "spot_preflop_unopened",
    "heroCards": [
      "Kd",
      "Qd"
    ],
    "board": [],
    "positions": [
      "SB",
      "BB",
      "UTG",
      "MP",
      "CO",
      "BTN"
    ],
    "heroSeat": 4,
    "coach": {
      "hand_label": "high card",
      "made_tier": "HIGH_CARD",
      "draws": [],
      "equity_pct": 52,
      "realized_equity_pct": 37,
      "realization_pct": 70,
      "win_pct": 50,
      "tie_pct": 4,
      "lose_pct": 46,
      "to_call": 2,
      "pot": 3,
      "required_equity_pct": 40.0,
      "required_direct_pct": 40.0,
      "implied_note": "",
      "pot_odds": "1.5 : 1",
      "call_ev": -0.2,
      "in_position": true,
      "action_closed": false,
      "players_behind": 2,
      "villains": [
        {
          "seat": 1,
          "archetype": "LAG",
          "combos": 373,
          "description": "LAG, preflop range → ~top 28.1% (373 combos)",
          "bluff_pct": 0.0
        }
      ],
      "verdict": "Fold.",
      "rationale": "~52% raw → ~37% realized in position vs the ~40% you need to call. Below the price once you account for how much of it you'll actually realize. Note: 2 still to act behind you, so calling doesn't close the action.",
      "tone": "fold",
      "basis": [
        "Hand classification and equity are computed (Monte Carlo, treys).",
        "Pot odds and required equity are exact arithmetic.",
        "Equity realization (raw → realized) is a rough position/hand-type/street estimate, not a solver output.",
        "Villain ranges are action-conditioned: the archetype range narrowed by their bets/calls this hand (bluff rates measured from the bots).",
        "For exact GTO frequencies, confirm in GTO Wizard."
      ]
    }
  },
  {
    "name": "spot_river_bluffcatch",
    "heroCards": [
      "Kd",
      "Ac"
    ],
    "board": [
      "2c",
      "Qs",
      "8h",
      "7c",
      "6c"
    ],
    "positions": [
      "SB",
      "BB",
      "UTG",
      "MP",
      "CO",
      "BTN"
    ],
    "heroSeat": 5,
    "coach": {
      "hand_label": "high card",
      "made_tier": "HIGH_CARD",
      "draws": [],
      "equity_pct": 3,
      "realized_equity_pct": 3,
      "realization_pct": 100,
      "win_pct": 3,
      "tie_pct": 0,
      "lose_pct": 97,
      "to_call": 106,
      "pot": 282,
      "required_equity_pct": 27.3,
      "required_direct_pct": 27.3,
      "implied_note": "",
      "pot_odds": "2.7 : 1",
      "call_ev": -93.9,
      "in_position": true,
      "action_closed": true,
      "players_behind": 0,
      "villains": [
        {
          "seat": 1,
          "archetype": "TAG",
          "combos": 34,
          "description": "TAG, 3-bet pre + c-bet flop + barreled turn + barreled river → ~top 2.6% (34 combos)",
          "bluff_pct": 2.9
        }
      ],
      "verdict": "Fold.",
      "rationale": "~3% equity vs the ~27% you need, and there's no more betting — a pure price decision. You're not being priced in.",
      "tone": "fold",
      "basis": [
        "Hand classification and equity are computed (Monte Carlo, treys).",
        "Pot odds and required equity are exact arithmetic.",
        "Villain ranges are action-conditioned: the archetype range narrowed by their bets/calls this hand (bluff rates measured from the bots).",
        "For exact GTO frequencies, confirm in GTO Wizard."
      ]
    }
  },
  {
    "name": "spot_river_bluffcatch_close",
    "heroCards": [
      "3s",
      "3c"
    ],
    "board": [
      "7h",
      "Ah",
      "Kd",
      "Kh",
      "8c"
    ],
    "positions": [
      "SB",
      "BB",
      "UTG",
      "MP",
      "CO",
      "BTN"
    ],
    "heroSeat": 5,
    "coach": {
      "hand_label": "two pair",
      "made_tier": "TWO_PAIR",
      "draws": [],
      "equity_pct": 28,
      "realized_equity_pct": 28,
      "realization_pct": 100,
      "win_pct": 28,
      "tie_pct": 0,
      "lose_pct": 71,
      "to_call": 127,
      "pot": 357,
      "required_equity_pct": 26.2,
      "required_direct_pct": 26.2,
      "implied_note": "",
      "pot_odds": "2.8 : 1",
      "call_ev": 10.8,
      "in_position": true,
      "action_closed": true,
      "players_behind": 0,
      "villains": [
        {
          "seat": 3,
          "archetype": "Calling Station",
          "combos": 466,
          "description": "Calling Station, barreled turn + barreled river → ~top 35.1% (466 combos)",
          "bluff_pct": 0.0
        }
      ],
      "verdict": "Close — call or fold.",
      "rationale": "~28% equity vs the ~26% you need, and there's no more betting — a pure price decision. It's borderline on price; it comes down to how often they're bluffing here. Confirm exact frequencies in GTO Wizard.",
      "tone": "close",
      "basis": [
        "Hand classification and equity are computed (Monte Carlo, treys).",
        "Pot odds and required equity are exact arithmetic.",
        "Villain ranges are action-conditioned: the archetype range narrowed by their bets/calls this hand (bluff rates measured from the bots).",
        "For exact GTO frequencies, confirm in GTO Wizard."
      ]
    }
  },
  {
    "name": "spot_river_bluffcatch_close_2",
    "heroCards": [
      "4d",
      "6d"
    ],
    "board": [
      "2d",
      "7s",
      "Qd",
      "4h",
      "Qc"
    ],
    "positions": [
      "SB",
      "BB",
      "UTG",
      "MP",
      "CO",
      "BTN"
    ],
    "heroSeat": 1,
    "coach": {
      "hand_label": "two pair",
      "made_tier": "TWO_PAIR",
      "draws": [],
      "equity_pct": 32,
      "realized_equity_pct": 32,
      "realization_pct": 100,
      "win_pct": 32,
      "tie_pct": 0,
      "lose_pct": 68,
      "to_call": 65,
      "pot": 152,
      "required_equity_pct": 30.0,
      "required_direct_pct": 30.0,
      "implied_note": "",
      "pot_odds": "2.3 : 1",
      "call_ev": 4.2,
      "in_position": true,
      "action_closed": true,
      "players_behind": 0,
      "villains": [
        {
          "seat": 0,
          "archetype": "Maniac",
          "combos": 87,
          "description": "Maniac, 3-bet pre + c-bet flop + barreled river → ~top 6.6% (87 combos)",
          "bluff_pct": 0.0
        }
      ],
      "verdict": "Close — call or fold.",
      "rationale": "~32% equity vs the ~30% you need, and there's no more betting — a pure price decision. It's borderline on price; it comes down to how often they're bluffing here. Confirm exact frequencies in GTO Wizard.",
      "tone": "close",
      "basis": [
        "Hand classification and equity are computed (Monte Carlo, treys).",
        "Pot odds and required equity are exact arithmetic.",
        "Villain ranges are action-conditioned: the archetype range narrowed by their bets/calls this hand (bluff rates measured from the bots).",
        "For exact GTO frequencies, confirm in GTO Wizard."
      ]
    }
  }
]

// Reduced answers (new-engine tables, D24), captured from the P3.12 backend: odds only
// after the flop, the chart advice preflop. Kept apart from COACH_SAMPLES, whose tests
// cover the nine full-coach verdicts.
export const REDUCED_SAMPLES: readonly CoachSample[] = [
  {
    "name": "reduced_flop_facing_bet",
    "heroCards": [
      "Kh",
      "6s"
    ],
    "board": [
      "9d",
      "4h",
      "2h",
      "5h"
    ],
    "positions": [
      "SB",
      "BB",
      "UTG",
      "MP",
      "CO",
      "BTN"
    ],
    "heroSeat": 5,
    "coach": {
      "hand_label": "king high + flush draw + gutshot",
      "made_tier": "HIGH_CARD",
      "draws": [
        "flush_draw",
        "gutshot"
      ],
      "equity_pct": 48.0,
      "realized_equity_pct": 48.0,
      "realization_pct": 100,
      "win_pct": 47,
      "tie_pct": 1,
      "lose_pct": 51,
      "to_call": 19,
      "pot": 44,
      "required_equity_pct": 30.2,
      "required_direct_pct": 30.2,
      "implied_note": "",
      "pot_odds": "2.3 : 1",
      "call_ev": null,
      "in_position": true,
      "action_closed": false,
      "players_behind": 0,
      "villains": [
        {
          "seat": 1,
          "archetype": "Pool average",
          "combos": 992,
          "description": "BB, preflop range → ~top 74.8% (992 combos)",
          "bluff_pct": 0.0
        }
      ],
      "verdict": "Odds only.",
      "rationale": "Your equity is 48.0% against the pool-average ranges; a call needs 30.2%.",
      "tone": "neutral",
      "basis": [
        "Hand classification is computed from your cards and the board.",
        "Equity is exact: every runout is counted.",
        "Pot odds and required equity are exact arithmetic.",
        "Villain ranges are the pool average: every player type's range for the preflop line taken, equally weighted.",
        "No realization, implied odds or call EV: the coach is not yet calibrated for the new bots."
      ],
      "winnable": 63,
      "big_blind": 10,
      "closes_on_call": true,
      "equity_method": "exact",
      "equity_se_pct": null,
      "hole_tier": "HIGH_CARD",
      "mode": "reduced",
      "mode_note": "Not yet calibrated for the new bots",
      "advice": null
    }
  },
  {
    "name": "reduced_preflop_open",
    "heroCards": [
      "2h",
      "2d"
    ],
    "board": [],
    "positions": [
      "SB",
      "BB",
      "UTG",
      "MP",
      "CO",
      "BTN"
    ],
    "heroSeat": 4,
    "coach": {
      "hand_label": "pocket 2s",
      "made_tier": "PAIR",
      "draws": [],
      "equity_pct": 50.4,
      "realized_equity_pct": 50.4,
      "realization_pct": 100,
      "win_pct": 50,
      "tie_pct": 0,
      "lose_pct": 50,
      "to_call": 10,
      "pot": 15,
      "required_equity_pct": 40.0,
      "required_direct_pct": 40.0,
      "implied_note": "",
      "pot_odds": "1.5 : 1",
      "call_ev": null,
      "in_position": true,
      "action_closed": false,
      "players_behind": 3,
      "villains": [
        {
          "seat": 1,
          "archetype": "Pool average",
          "combos": 1225,
          "description": "BB, preflop range → ~top 92.4% (1225 combos)",
          "bluff_pct": 0.0
        }
      ],
      "verdict": "Open-raise to 2.5 bb.",
      "rationale": "22 is in your CO chart.",
      "tone": "good",
      "basis": [
        "Hand classification is computed from your cards and the board.",
        "Preflop equity comes from a precomputed table (±0.4 pp).",
        "Pot odds and required equity are exact arithmetic.",
        "Villain ranges are the pool average: every player type's range for the preflop line taken, equally weighted.",
        "Preflop advice is the baseline chart the new bots play (STRATEGY.md §2).",
        "No realization, implied odds or call EV: the coach is not yet calibrated for the new bots."
      ],
      "winnable": 25,
      "big_blind": 10,
      "closes_on_call": false,
      "equity_method": "preflop_table",
      "equity_se_pct": null,
      "hole_tier": "PAIR",
      "mode": "reduced",
      "mode_note": "Preflop chart advice; odds only after the flop",
      "advice": {
        "action": "raise",
        "to_amount": 25,
        "chart": "CO open",
        "in_chart": true,
        "hand": "22",
        "position": "CO",
        "all_in": false
      }
    }
  },
  {
    "name": "reduced_preflop_3bet",
    "heroCards": [
      "Jc",
      "Jd"
    ],
    "board": [],
    "positions": [
      "SB",
      "BB",
      "UTG",
      "MP",
      "CO",
      "BTN"
    ],
    "heroSeat": 0,
    "coach": {
      "hand_label": "pocket Js",
      "made_tier": "PAIR",
      "draws": [],
      "equity_pct": 70.9,
      "realized_equity_pct": 70.9,
      "realization_pct": 100,
      "win_pct": 71,
      "tie_pct": 0,
      "lose_pct": 29,
      "to_call": 22,
      "pot": 42,
      "required_equity_pct": 34.4,
      "required_direct_pct": 34.4,
      "implied_note": "",
      "pot_odds": "1.9 : 1",
      "call_ev": null,
      "in_position": false,
      "action_closed": false,
      "players_behind": 1,
      "villains": [
        {
          "seat": 4,
          "archetype": "Pool average",
          "combos": 409,
          "description": "CO, raised pre → ~top 30.9% (409 combos)",
          "bluff_pct": 0.0
        }
      ],
      "verdict": "3-bet to 10.8 bb.",
      "rationale": "JJ is in your value 3-bet vs CO chart.",
      "tone": "good",
      "basis": [
        "Hand classification is computed from your cards and the board.",
        "Preflop equity comes from a precomputed table (±0.4 pp).",
        "Pot odds and required equity are exact arithmetic.",
        "Villain ranges are the pool average: every player type's range for the preflop line taken, equally weighted.",
        "Preflop advice is the baseline chart the new bots play (STRATEGY.md §2).",
        "No realization, implied odds or call EV: the coach is not yet calibrated for the new bots."
      ],
      "winnable": 64,
      "big_blind": 10,
      "closes_on_call": false,
      "equity_method": "preflop_table",
      "equity_se_pct": null,
      "hole_tier": "PAIR",
      "mode": "reduced",
      "mode_note": "Preflop chart advice; odds only after the flop",
      "advice": {
        "action": "3bet",
        "to_amount": 108,
        "chart": "value 3-bet vs CO",
        "in_chart": true,
        "hand": "JJ",
        "position": "SB",
        "all_in": false
      }
    }
  }
]

/** A sample by name; throws for an unknown name (tests and the harness only). */
export function coachSample(name: string): CoachSample {
  const s = COACH_SAMPLES.find((x) => x.name === name) ?? REDUCED_SAMPLES.find((x) => x.name === name)
  if (!s) throw new Error(`No coach sample named ${name}`)
  return s
}
