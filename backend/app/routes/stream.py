import json

from fastapi import APIRouter, Request
from sse_starlette import EventSourceResponse, ServerSentEvent

from app.events import broadcaster

router = APIRouter(prefix="/api")

HEARTBEAT_S = 10


@router.get("/stream")
async def stream(request: Request) -> EventSourceResponse:
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
            yield {"event": payload["kind"], "data": json.dumps(payload, ensure_ascii=False)}

    return EventSourceResponse(gen())
