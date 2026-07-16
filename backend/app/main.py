from fastapi import FastAPI

from app.lifecycle import startup
from app.routers import crawler, disclosure, imports, policies, system, topology, trading


app = FastAPI(title="Power Market Portal API", version="0.1.0")

app.include_router(system.router)
app.include_router(crawler.router)
app.include_router(disclosure.router)
app.include_router(policies.router)
app.include_router(imports.router)
app.include_router(trading.router)
app.include_router(topology.router)


@app.on_event("startup")
def on_startup() -> None:
    startup()
