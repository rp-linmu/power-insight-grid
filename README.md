# Power Insight Grid

Power Insight Grid is a local power-market decision support system. This open-source package keeps the general portal, data acquisition bridge, disclosure/clearing views, topology analysis, policy workspace, and import management code.

This package intentionally excludes private algorithm modules:

- Short-term spread forecasting package.
- Mid/long-term price forecast and contract adjustment algorithms.
- Real market data, databases, logs, model artifacts, browser sessions, and local credentials.

## Modules Included

- Backend API: `backend/app`
- Frontend portal: `frontend`
- Market data crawler control service: `gd-market-crawler`
- Topology, disclosure, clearing, policies, imports, and trading context modules
- Deployment examples and general documentation

## Quick Start

Full setup instructions are available in [INSTALLATION_AND_USAGE.md](INSTALLATION_AND_USAGE.md).

Copy `.env.example` to `.env` and fill local-only settings.

```powershell
cd open_source_release
.\start.bat
```

The backend launcher uses `python` by default. If your local Python is elsewhere, set `PYTHON_EXE` before startup:

```powershell
$env:PYTHON_EXE = "C:\path\to\python.exe"
.\start.bat
```

Load one sanitized demo day for UI testing:

```powershell
cd open_source_release\backend
python .\scripts\load_demo_day.py --date 2026-07-01
```

If you prefer PowerShell script startup, use:

```powershell
cd open_source_release
powershell.exe -ExecutionPolicy Bypass -File .\start.ps1
```

Services:

- Backend: `http://127.0.0.1:8001`
- Frontend: `http://127.0.0.1:3000`
- Crawler control service: `http://127.0.0.1:8787`

Stop services:

```powershell
.\stop.ps1
```

## Security Notes

Do not commit real `.env` files, crawler login configuration, downloaded market data, SQLite databases, model outputs, or logs.

Before publishing your fork, run the checks listed in `OPEN_SOURCE_NOTES.md`.

## Documentation

- [Installation and Usage](INSTALLATION_AND_USAGE.md)
- [Code Functions](CODE_FUNCTIONS.md)
- [Open Source Notes](OPEN_SOURCE_NOTES.md)
