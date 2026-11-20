# 0004: A static app on GitHub Pages, files stay in the browser

**Status:** accepted, 0.1.0

## Context

My default host for apps is Vercel. This app needs no server: all statistics run in JavaScript, and test files can contain user IDs that should not leave the user's computer.

## Decision

Host it as a static site on GitHub Pages at kostasxeras.com/experiment-readout/, like the other static apps in the portfolio. Uploaded CSV files are read with the browser's FileReader and never sent anywhere. The two examples ship as small pre-computed summaries (`data/demo-*.json`) built by the same engine.

## Trade-off

- No server means no saved readouts and no sharing by link in 0.1.0.
- In return there are no hosting costs, no cold starts, and a simple privacy answer: the file never leaves the browser.

Very large files (several hundred MB) may be slow, because everything runs on the user's device. The 16 MB landing page file works.
