# Case study: Experiment Readout

## The question

Can a readout tool stop a team from shipping (or killing) a change on numbers it should not trust, and can it make the decision rules visible instead of leaving them in someone's head?

## Approach

1. **Checks before metrics.** The app cleans the data and runs four checks before it shows any result: the split between groups against the plan, users who saw the wrong version, users who appear more than once, and sample size. Averages are also checked for extreme outliers.
2. **Rules as inputs.** The PM sets the smallest lift worth shipping, the guardrail tolerance, the significance level, the planned split and the split-check threshold. The starting values are placeholders, not advice.
3. **Four calls, one reason each.** Fix the data first, don't ship, ship, run longer. The reason that decided the call is shown first.
4. **Checked against a standard tool.** The engine's p-values, rates and split test match SciPy on both example datasets (6 of 6 checks pass).

Both examples below were run with the starting rules: significance 0.05, smallest worthwhile lift 1%, guardrail tolerance 1%, split check at p < 0.01, planned split 50/50.

## Finding 1: the game test should not be read yet

Cookie Cats is a mobile puzzle game. The test moved the first gate (where players must wait or pay) from level 30 to level 40. The primary metric was 7-day retention, with 1-day retention and rounds played as guardrails.

| | Gate at 30 | Gate at 40 |
|---|---|---|
| Players | 44,700 | 45,489 |
| 7-day retention | 19.02% | 18.20% |
| 1-day retention | 44.82% | 44.23% |
| Rounds played (average) | 52.46 | 51.30 |

- **Split check: failed.** The groups differ by 789 players. With a planned 50/50 split, a gap this large happens by chance with p = 0.0086. The call is "fix the data first".
- If the split check is relaxed to p < 0.001, the call becomes "don't ship": 7-day retention fell by 4.31% relative (95% interval −6.98% to −1.64%, p = 0.0016). Neither guardrail dropped significantly.
- Rounds played has an extreme outlier: one player has 49,854 rounds. The next highest has 2,961, and 99% of players have 493 or fewer. The app flags this metric so nobody reads its average without checking.

**What this means.** The retention drop looks strong, but a split problem can bias results in either direction. Before deciding, someone should find out why more players landed in the level-40 group. Possible causes include how players were assigned and which players were kept in the export. These are hypotheses. The dataset alone cannot tell which one is true.

## Finding 2: the landing page test is a clear "don't ship"

The test compared an old and a new landing page on conversion.

- 294,478 rows in.
- 3,893 rows (1.32%) showed a page that did not match the group. They were removed. Under the 5% limit, so this is a warning, not a stop.
- 3,894 users appeared more than once (7,788 rows). All their rows were removed, because their group cannot be trusted.
- 286,690 rows after cleaning. The split passed (p = 0.85).

| | Old page | New page |
|---|---|---|
| Users | 143,293 | 143,397 |
| Conversion | 12.02% | 11.87% |

Change: −1.20% relative, 95% interval −3.18% to +0.77%, p = 0.23. The test could reliably detect a change of about 2.8% relative.

The call is "don't ship". Not because the new page is proven worse, but because the interval rules out the 1% lift the rules ask for.

## Finding 3: the call depends on the rules, and the app shows how

With the smallest worthwhile lift set to 0.5% instead of 1%, the landing page call changes to "run longer". The interval still includes a 0.5% lift. To find a lift that small 80% of the time, the test would need about 32 times its current number of users. For most teams that answer is effectively "stop", but it is a business decision, and the app makes the trade-off visible instead of hiding it in a default.

## Confirmed and not confirmed

- **Confirmed:** every number above, computed by the engine and checked against SciPy.
- **Not confirmed:** the cause of the split problem in Cookie Cats, and whether either effect would hold in a new test. The rule thresholds (1%, 1%, 5% wrong-version limit) are my choices for a demo, not industry standards.

## What I would do next

- Several treatment groups, with a correction for multiple comparisons.
- A pre-test planner: enter the baseline and the lift you need, get the users and days required.
- Segment breakdowns (new against returning users, device), with a warning about reading many segments.
- A short written readout to copy into a team update.

## My role

I framed the problem, chose the checks and the decision rules, picked the datasets and wrote the findings.
