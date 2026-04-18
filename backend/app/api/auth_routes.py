"""
Auth API Routes â€” FastAPI endpoints for OTP, password reset, and user session.
"""
from fastapi import APIRouter, Body, Request, HTTPException, Header
from typing import Dict, Any, Optional
from app.services.auth_service import auth_service

auth_router = APIRouter(redirect_slashes=False)


@auth_router.post("/send-otp")
async def send_otp(request: Request, payload: Dict[str, Any] = Body(...)):
    """
    Send OTP to email or phone.
    Body: { "type": "email" | "phone", "email": "...", "phone": "+91..." }
    """
    otp_type = payload.get("type", "email")
    client_ip = request.client.host if request.client else "unknown"

    if otp_type == "email":
        email = payload.get("email", "")
        if not email:
            raise HTTPException(status_code=400, detail="Email is required")
        result = await auth_service.send_email_otp(email, client_ip)
    elif otp_type == "phone":
        phone = payload.get("phone", "")
        if not phone:
            raise HTTPException(status_code=400, detail="Phone number is required")
        result = await auth_service.send_phone_otp(phone, client_ip)
    else:
        raise HTTPException(status_code=400, detail="Invalid OTP type. Use 'email' or 'phone'")

    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@auth_router.post("/verify-otp")
async def verify_otp(payload: Dict[str, Any] = Body(...)):
    """
    Verify OTP code.
    Body: { "type": "email" | "sms", "token": "123456", "email": "...", "phone": "+91..." }
    """
    otp_type = payload.get("type", "email")
    token = payload.get("token", "")
    email = payload.get("email")
    phone = payload.get("phone")

    if not token:
        raise HTTPException(status_code=400, detail="OTP token is required")

    result = await auth_service.verify_otp(
        token=token,
        otp_type=otp_type,
        email=email,
        phone=phone
    )

    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@auth_router.post("/reset-password")
async def reset_password(payload: Dict[str, Any] = Body(...)):
    """
    Send password reset email.
    Body: { "email": "user@example.com" }
    """
    email = payload.get("email", "")
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")

    result = await auth_service.reset_password(email)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@auth_router.get("/me")
async def get_current_user(authorization: Optional[str] = Header(None)):
    """
    Get current user from Bearer token.
    Header: Authorization: Bearer <access_token>
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")

    token = authorization.replace("Bearer ", "")
    result = await auth_service.get_user(token)

    if not result["success"]:
        raise HTTPException(status_code=401, detail=result["error"])
    return result

