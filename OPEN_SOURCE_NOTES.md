# Open Source Release Notes

This folder is a sanitized source package for publishing.

Excluded from this release:

- Private short-term spread forecasting package.
- Private mid/long-term adjustment and forecasting packages.
- Real databases, backups, logs, crawler downloads, browser sessions, and generated outputs.
- Local-only config files such as `.env`, `.env.local`, and `gd-market-crawler/config.local.json`.
- Real market data, model artifacts, and private Excel/CSV files.

Before publishing, review the working tree for credentials, private local paths, databases, spreadsheets, logs, model artifacts, browser sessions, and generated output files.

If any real key was ever committed to a Git history, rotate the key immediately and clean Git history before publishing.
