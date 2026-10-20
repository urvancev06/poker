# poker (backend)

The Python backend of the 6-max No-Limit Hold'em trainer: the PokerKit engine
wrapper, equity maths, bots, coach, simulator and the FastAPI app. The project
overview, results and design notes are in the repository's top-level
`README.md` and `ARCHITECTURE.md`.

```bash
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -e ".[dev]"
.venv/bin/python -m pytest
.venv/bin/uvicorn poker.api.app:app --reload   # http://127.0.0.1:8000/docs
```
