---
description: Erase every local carousel, image and export, then start clean (asks first).
allowed-tools: Bash(rm *), Bash(ls *), Bash(node *), AskUserQuestion
---

This is destructive and nothing here is recoverable — `data/` and
`public/uploads/` are the only copy.

First, show what is about to be lost. Count the carousels in
`data/carousels.json`, the templates in `data/templates.json`, and the files in
`public/uploads/`.

Then ask with AskUserQuestion, naming those numbers:

> "Delete N carousels, M templates and K uploaded images? Your brand settings
> stay. This cannot be undone."

Options: **Delete everything** / **Keep my work**.

On **Delete everything**: remove `data/carousels.json`, `data/templates.json`,
`data/history-*.json`, `data/exports/*` and `public/uploads/*`. Leave
`data/brand.json` and `data/settings.json` alone — losing a configured brand is
rarely what someone means by "reset". Report exactly what was removed.

On **Keep my work**: change nothing and say so.
