# Open Source Release Notes

This folder is a sanitized source package for publishing.

Excluded from this release:

- Private short-term spread forecasting package.
- Private mid/long-term adjustment and forecasting packages.
- Real databases, backups, logs, crawler downloads, browser sessions, and generated outputs.
- Local-only config files such as `.env`, `.env.local`, and `gd-market-crawler/config.local.json`.
- Real market data, model artifacts, and private Excel/CSV files.

Before publishing, run:

```powershell
rg -n "api_key|apikey|secret|token|password|cookie|authorization|OPENAI|DASHSCOPE|DEEPSEEK|ANTHROPIC" .
rg -n "<local-user-path>|AppData|Documents|your-local-project-root" .
rg --files | rg "\.(db|sqlite|sqlite3|xlsx|xls|csv|log|pkl)$"
```

If any real key was ever committed to a Git history, rotate the key immediately and clean Git history before publishing.
