# Changelog

All notable changes to this project. Versions follow [docs/versioning.md](docs/versioning.md).

## [0.1.0] - 2026-11-20

First release.

### Added
- Three ways to load a test: two public example tests, a CSV file read in the browser, or four typed-in counts.
- Column mapping for uploaded files, with a first guess at the group, user ID, version shown, timestamp and metric columns.
- Data checks before any metric: group split against the plan, users who saw the wrong version, users who appear more than once, sample size, and outliers in averages.
- Metrics table with change, 95% interval, p-value and the smallest change the test could detect.
- One call (ship, don't ship, run longer, fix the data first) with the reasons, updated live when a decision rule changes.
- Primary metric by day when the data has timestamps.
- SciPy check of the engine on both example datasets (6 of 6 pass).
- Case study, product brief and four decision records.
