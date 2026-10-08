import json

from fastapi import APIRouter, Request
from sse_starlette import EventSourceResponse, ServerSentEvent

from app.events import broadcaster

router = APIRouter(prefix="/api")


@router.get("/stream")
async def stream(request: Request) -> EventSourceResponse:
    async def gen():
        # Flush something at once so proxies forward the response headers immediately.
        yield ServerSentEvent(comment="connected")
        async for payload in broadcaster.subscribe():
            if await request.is_disconnected():
                break
            yield {"event": payload["kind"], "data": json.dumps(payload, ensure_ascii=False)}

    return EventSourceResponse(gen(), ping=15)
