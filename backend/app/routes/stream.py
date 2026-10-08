import json

from fastapi import APIRouter, Request
from sse_starlette.sse import EventSourceResponse

from app.events import broadcaster

router = APIRouter(prefix="/api")


@router.get("/stream")
async def stream(request: Request) -> EventSourceResponse:
    async def gen():
        async for payload in broadcaster.subscribe():
            if await request.is_disconnected():
                break
            yield {"event": payload["kind"], "data": json.dumps(payload, ensure_ascii=False)}

    return EventSourceResponse(gen(), ping=15)
