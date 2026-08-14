"""DPDP Act (India) compliance API endpoints.

Endpoints (mounted under /api/v1/users):
  POST   /consent           — grant or withdraw granular consent (logged)
  GET    /consent           — current consent state for the UI
  GET    /profile/export    — right to access / data portability (JSON or CSV)
  DELETE /profile           — right to erasure (30-day grace, then hard purge)
  POST   /profile/cancel-deletion — reverse a deletion request in grace period
"""

import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from app.api.deps import get_client_ip, get_current_user_id
from app.security import EventType, audit_logger
from app.services.privacy_service import (
    DEFAULT_NOTICE_VERSION,
    CONSENT_TYPES,
    build_data_export,
    cancel_erasure,
    export_csv,
    get_account_status,
    get_user_consents,
    record_consent,
    schedule_erasure,
)

privacy_router = APIRouter()
logger = logging.getLogger("resumatch-api.privacy")


class ConsentRequest(BaseModel):
    consent_type: str = Field(..., description="One of: essential, analytics, marketing, preferences")
    status: bool = Field(..., description="True to grant, False to withdraw")
    notice_version: str = DEFAULT_NOTICE_VERSION
    language_code: str = "en"
    user_agent: Optional[str] = None


class ErasureRequest(BaseModel):
    reason: Optional[str] = None
    user_agent: Optional[str] = None


@privacy_router.post("/consent")
async def update_consent(
    request: Request,
    body: ConsentRequest,
    user_id: str = Depends(get_current_user_id),
):
    if body.consent_type not in CONSENT_TYPES:
        raise HTTPException(status_code=422, detail=f"consent_type must be one of {list(CONSENT_TYPES)}")

    ip = await get_client_ip(request)
    record = record_consent(
        user_id=user_id,
        consent_type=body.consent_type,
        status=body.status,
        notice_version=body.notice_version or DEFAULT_NOTICE_VERSION,
        language_code=body.language_code or "en",
        ip_address=ip,
    )
    audit_logger.log(
        EventType.CONSENT_UPDATED,
        user_id=user_id,
        ip_address=ip,
        extra={
            "consent_type": body.consent_type,
            "status": bool(body.status),
            "notice_version": body.notice_version or DEFAULT_NOTICE_VERSION,
            "language_code": body.language_code or "en",
        },
    )
    action = "granted" if body.status else "withdrawn"
    return {
        "success": True,
        "message": f"Consent preference updated for '{body.consent_type}' ({action}). Associated background processing has ceased.",
        "updated_at": record.get("updated_at"),
        "consent": record,
    }


@privacy_router.get("/consent")
async def list_consent(user_id: str = Depends(get_current_user_id)):
    consents = get_user_consents(user_id)
    state = {c["consent_type"]: bool(c["status"]) for c in consents}
    return {
        "success": True,
        "notice_version": DEFAULT_NOTICE_VERSION,
        "consents": consents,
        "state": state,
    }


@privacy_router.get("/profile/export")
async def export_profile(
    request: Request,
    user_id: str = Depends(get_current_user_id),
    format: str = Query("json", pattern="^(json|csv)$"),
):
    ip = await get_client_ip(request)
    if format == "csv":
        csv_data = export_csv(user_id)
        audit_logger.log(
            EventType.DATA_EXPORT,
            user_id=user_id,
            ip_address=ip,
            extra={"format": "csv"},
        )
        return PlainTextResponse(
            csv_data,
            media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="my-data.csv"'},
        )

    data = build_data_export(user_id)
    audit_logger.log(
        EventType.DATA_EXPORT,
        user_id=user_id,
        ip_address=ip,
        extra={"format": "json"},
    )
    return {"success": True, "data": data}


@privacy_router.get("/profile")
async def get_profile_status(user_id: str = Depends(get_current_user_id)):
    """Lifecycle status (deletion pending? grace period ends when?) for the UI."""
    return {"success": True, **get_account_status(user_id)}


@privacy_router.delete("/profile")
async def delete_profile(
    request: Request,
    body: Optional[ErasureRequest] = None,
    user_id: str = Depends(get_current_user_id),
):
    ip = await get_client_ip(request)
    result = schedule_erasure(user_id)
    audit_logger.log(
        EventType.ERASURE_REQUESTED,
        user_id=user_id,
        ip_address=ip,
        extra={"reason": (body.reason if body else None) or ""},
    )
    return {"success": True, **result}


@privacy_router.post("/profile/cancel-deletion")
async def cancel_deletion(
    request: Request,
    user_id: str = Depends(get_current_user_id),
):
    ip = await get_client_ip(request)
    result = cancel_erasure(user_id)
    audit_logger.log(
        EventType.ERASURE_CANCELLED,
        user_id=user_id,
        ip_address=ip,
    )
    return {"success": True, **result}
