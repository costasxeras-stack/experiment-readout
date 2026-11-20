# 0003: The decision rules are inputs, not hidden constants

**Status:** accepted, 0.1.0

## Context

"Is this significant?" is not the product question. The product question is "is this change worth shipping, and did it hurt anything we care about?". That depends on the smallest lift worth the cost of shipping and on how much a guardrail may drop. Those numbers differ by product and team.

## Decision

The smallest worthwhile lift, guardrail tolerance, significance level, planned split and split-check threshold are all visible inputs. The call updates when any of them changes. The interface says the starting values are assumptions, not recommendations. The four calls use fixed, written rules:

1. Fix the data first: split check fails, or more than 5% of rows show the wrong version.
2. Don't ship: the primary metric got significantly worse, a guardrail dropped significantly by more than the tolerance, or the 95% interval rules out the smallest worthwhile lift.
3. Ship: the primary metric improved significantly and no guardrail broke.
4. Run longer: anything else, with the number of users needed to detect the smallest worthwhile lift.

## Trade-off

- Inputs add complexity, and a user can tune them until they get the answer they want.
- Hidden defaults look simpler but make the tool's opinion look like a fact.

Visible inputs make the tuning visible too, which is the better problem to have. A later version could record the rules before the data is loaded, so they cannot be changed after seeing the result.
