# S10: Laboratory master

Status: started 2026-10-09
Work-order slot: Masters, after S9. Finance stays after S10.

## Scope
- In: `laboratories` with `legacy_client_id`. Backfill from client rows whose type is Testing Laboratory or Calibration Laboratory. Those client rows stay. Page `/masters/laboratories`. BIS address lookup checks the laboratory first, then the client.
- Out: rate overlap rules, deleting laboratory clients, fee estimator, dashboard card.

## Acceptance
A laboratory can be added without removing its client row. OSL address lookup still finds a lab that exists only as a client.
