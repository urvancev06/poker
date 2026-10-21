"""Bots v2: the logical policy behind ``engine=v2`` (phase 3).

    charts      preflop charts, the opening order and the STRATEGY.md §2 render
    dials       the 16 dials and tau, the five type means and DIAL_META
    types       Kind, Choice, ActionDist, Node, Trace, Private, PreflopLine
    spot        Spot features built from a DecisionContext
    scenario    a line DSL that deals a real Hand up to the hero's decision
    preflop     the chart-based preflop policy and the preflop-line likelihood
    constants   every §4.6 postflop number, by name
    bettor      the bettor priors (D34)
    private     the deciding player's private features (h_j, s, draws)
    postflop    the priced postflop policy
    sizing      texture sizing, preflop sizes, legal chip amounts
    leaks       the six named leaks

The v1 bots (``poker.bots.archetypes`` / ``strategy``) stay frozen until phase 5;
nothing here is imported by them.
"""
