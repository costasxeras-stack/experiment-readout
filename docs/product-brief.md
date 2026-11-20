# Product brief

## Problem

Teams read A/B tests by looking at the headline lift and its p-value. Problems in the data (an uneven split, users who saw the wrong version, users counted twice) are found late or never. A test with no significant result is often called "flat" even when it was too small to find the effect the team needed. And the rules for the decision live in someone's head, so two people can read the same test differently.

## Users

- **Product managers** who run tests and must make the ship call. They know what a p-value is but do not want to rebuild the checks for every test.
- **Analysts** who want a quick second look before writing a full readout.
- **Hiring managers** reading this portfolio, who want to see how I think about experiments.

## Goals

1. No metric is read before the data checks are shown.
2. Every call comes with the reason that decided it, in plain words.
3. The decision rules are inputs that the PM sets, not hidden constants.
4. When the answer is "not enough data", say how much more is needed.

## Non-goals for 0.1.0

- Several treatment groups, or segment breakdowns.
- Correction for testing many metrics, and sequential testing.
- Saving or sharing readouts.
- Any server. Files stay in the browser.

## Success measures

The app is a portfolio piece, so there is no usage target. It succeeds if:
- its numbers match SciPy on public data (done: 6 of 6),
- a reader can explain why each example got its call after one read.
