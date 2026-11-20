# 0001: A failed split check blocks the call

**Status:** accepted, 0.1.0

## Context

A sample ratio mismatch (groups much more uneven than planned) means something went wrong in assignment or logging. Results from such a test can be biased in either direction. Many dashboards show it as a small warning next to the result, and people read the result anyway.

## Decision

If the split check fails, the call is "fix the data first", whatever the metrics say. The metrics are still shown, so the PM can see what is at stake, but the call does not use them. The threshold is p < 0.01 by default and can be set to p < 0.001.

## Trade-off

- A strict check sometimes blocks a test whose split problem turns out to be harmless. The cost is a delay while someone checks.
- A soft warning lets a biased result drive a ship decision. That cost is usually larger and harder to see.

I chose the delay. The Cookie Cats example shows the effect: with the default threshold it is blocked (p = 0.0086). With p < 0.001 it reads as a significant retention drop.
