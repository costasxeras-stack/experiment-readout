# 0002: Remove every row of a user who appears more than once

**Status:** accepted, 0.1.0

## Context

In a one-row-per-user file, a user who appears twice may have been assigned twice, possibly to both groups. Common options are to keep the first row, keep the last row, or drop the user.

## Decision

Drop all rows of any user who appears more than once, and say how many users and rows were removed.

## Trade-off

- Keeping one row keeps more data, but we cannot know which row reflects what the user actually experienced.
- Dropping the user loses data. In the landing page example that is 3,894 users (7,788 rows) out of 294,478 rows, about 2.6%.

Losing 2.6% of the sample costs little power. Keeping rows of users whose group is unknown can bias the result. If a future dataset has many duplicates, the check will show it as a warning and the PM can decide whether the test is still usable.
