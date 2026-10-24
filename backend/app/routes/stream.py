import json

from fastapi import APIRouter, Request
from sse_starlette import EventSourceResponse, ServerSentEvent

from app.events import broadcaster
from app.officer import is_officer

router = APIRouter(prefix="/api")

HEARTBEAT_S = 10


def shown(payload: dict, officer: bool) -> dict:
    """The signed-in console gets every event. Anyone else (the volunteer's phone) gets only the
    kind, which is enough to know when to reload, and never a name or a feed line."""
    return payload if officer else {"kind": payload["kind"]}


@router.get("/stream")
async def stream(request: Request) -> EventSourceResponse:
    officer = is_officer(request)

    async def gen():
        # Flush something at once so proxies forward the response headers immediately.
        yield ServerSentEvent(comment="connected")
        yield {"event": "heartbeat", "data": "{}"}
        async for payload in broadcaster.subscribe(heartbeat_s=HEARTBEAT_S):
            if await request.is_disconnected():
                break
            if payload is None:
                # Clients reconnect when heartbeats stop (a stalled proxy or Wi-Fi drop).
                yield {"event": "heartbeat", "data": "{}"}
                continue
            yield {"event": payload["kind"], "data": json.dumps(shown(payload, officer), ensure_ascii=False)}

    return EventSourceResponse(gen())
