"""
backend/api/websocket/ecg_stream.py
=====================================
WebSocket endpoint — /ws/ecg

Protocol:
  Server → Client: binary ECG packets (see state_machine._encode_packet)
  Client → Server: JSON instructor commands
    {"type": "SET_STATE", "payload": {...ECGStateUpdate fields...}}
    {"type": "GET_STATE"}
    {"type": "PING"}
"""

from __future__ import annotations
import json
import traceback
from fastapi import WebSocket, WebSocketDisconnect
from engine.state_machine import engine
from models.ecg_state import ECGStateUpdate


def _state_snapshot() -> str:
    """Return current engine state as a JSON STATE_SNAPSHOT string."""
    return json.dumps({
        "type": "STATE_SNAPSHOT",
        "payload": engine.state.model_dump(mode="json"),
    })


async def ecg_websocket(ws: WebSocket) -> None:
    await ws.accept()
    print(f"[WS] Client connected: {ws.client}")

    # Register this client to receive ECG stream packets
    async def send_fn(data: bytes) -> None:
        await ws.send_bytes(data)

    engine.add_client(send_fn)
    # Send current state immediately
    await ws.send_text(_state_snapshot())

    try:
        while True:
            # Receive instructor commands — inner try so one bad message
            # doesn't kill the whole connection.
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError as e:
                print(f"[WS] Bad JSON from client: {e}")
                continue

            msg_type = msg.get("type")

            if msg_type == "SET_STATE":
                payload = msg.get("payload", {})
                try:
                    update = ECGStateUpdate.model_validate(payload)
                except Exception as e:
                    print(f"[WS] SET_STATE validation error: {e} | payload={payload}")
                    await ws.send_text(json.dumps({
                        "type": "ERROR",
                        "message": f"Validation error: {e}",
                    }))
                    continue

                print(f"[WS] SET_STATE: {update.model_dump(exclude_none=True)}")
                try:
                    await engine.apply_command(update)
                except Exception as e:
                    print(f"[WS] apply_command error: {e}")
                    traceback.print_exc()
                    continue

                print(f"[WS] After apply: hr={engine.state.heart_rate:.1f}, rhythm={engine.state.rhythm}")
                await ws.send_text(_state_snapshot())

            elif msg_type == "GET_STATE":
                await ws.send_text(_state_snapshot())

            elif msg_type == "PING":
                await ws.send_text(json.dumps({"type": "PONG"}))

            else:
                print(f"[WS] Unknown message type: {msg_type}")

    except WebSocketDisconnect:
        print(f"[WS] Client disconnected: {ws.client}")
    except Exception as e:
        print(f"[WS] Unexpected crash: {e}")
        traceback.print_exc()
    finally:
        engine.remove_client(send_fn)
