# Current 21Z observations during harness integration

The audited V6 harness was rerun against landed 21Z while integrating it as project tooling.

## Confirmed repaired by this cut

- Seed `671278205`, chunk `24,0`: the prior unresolved-portal `JWEB_TOWER_TRANSFER_BINDING_MISSING` failure no longer occurs after excluding explicit `resolved:false` portals from transfer-demand candidates.
- Sampled published mezzanine stairs are now gated by JWEB's own `fits-resolved-truth` classification and required clear width.

## Separate pre-existing current-21Z failure

Seed `671278205`, chunk `2,0` fails on untouched landed 21Z with:

`JWEB_TOWER_TRANSFER_UNREALIZED` — Building Plan cannot realize a public through-route between requested exchanges.

A baseline comparison with both new fixes reverted reproduced the same failure, so it is not introduced by the geometry-harness integration. It is retained as a future minimized repro rather than expanding this tooling cut into another transfer-planning redesign.
