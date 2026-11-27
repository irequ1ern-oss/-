"""Decode the OpenAI-compatible providers' streamed text and fragmented tools."""

import json


async def completion_events(response):
    response.raise_for_status()
    text = ""
    calls = {}
    usage = None
    count = 0
    finished = False
    async for line in response.aiter_lines():
        if not line.startswith("data:"):
            continue
        payload = line[5:].strip()
        if payload == "[DONE]":
            break
        count += len(payload)
        if count > 512_000:
            raise ValueError("Слишком большой поток")
        chunk = json.loads(payload)
        if not isinstance(chunk, dict) or chunk.get("error"):
            raise ValueError("Ошибка потока")
        if isinstance(chunk.get("usage"), dict):
            usage = chunk["usage"].get("total_tokens")
        for choice in chunk.get("choices", []):
            if choice.get("index", 0) != 0:
                continue
            delta = choice.get("delta") or {}
            piece = delta.get("content") or ""
            if piece:
                text += piece
                if len(text) > 16000:
                    raise ValueError("Слишком длинный ответ")
                yield {"type": "delta", "text": piece}
            for part in delta.get("tool_calls") or []:
                idx = part["index"]
                if type(idx) is not int or not 0 <= idx < 8:
                    raise ValueError("Неверный индекс инструмента")
                call = calls.setdefault(
                    idx,
                    {
                        "id": "",
                        "type": "function",
                        "function": {"name": "", "arguments": ""},
                    },
                )
                call["id"] += part.get("id") or ""
                for field in ("name", "arguments"):
                    call["function"][field] += (part.get("function") or {}).get(
                        field
                    ) or ""
            if choice.get("finish_reason"):
                finished = True
    if not finished:
        raise ValueError("Соединение с моделью прервалось")
    ordered = [calls[k] for k in sorted(calls)]
    if any(not c["id"] or not c["function"]["name"] for c in ordered):
        raise ValueError("Незавершённый вызов инструмента")
    yield {
        "type": "message",
        "message": {"content": text or None, "tool_calls": ordered},
        "usage": usage,
    }
