"""
Auth Service — Direct Supabase REST API calls for OTP, password reset, and user management.
Uses SUPABASE_SERVICE_ROLE_KEY for admin operations via httpx (avoids Python SDK version issues).
"""
import os
import re
import time
import logging
from typing import Dict, Any
import httpx

logger = logging.getLogger("resumatch-api.auth")

# Rate limiting store (in-memory, per-process)
_otp_rate_limit: Dict[str, list] = {}
OTP_RATE_LIMIT_MAX = 5  # max requests per window
OTP_RATE_LIMIT_WINDOW = 300  # 5 minutes


def _check_rate_limit(key: str) -> bool:
    """Returns True if rate limit exceeded."""
    now = time.time()
    if key not in _otp_rate_limit:
        _otp_rate_limit[key] = []
    _otp_rate_limit[key] = [t for t in _otp_rate_limit[key] if now - t < OTP_RATE_LIMIT_WINDOW]
    if len(_otp_rate_limit[key]) >= OTP_RATE_LIMIT_MAX:
        return True
    _otp_rate_limit[key].append(now)
    return False


class AuthService:
    def __init__(self):
        self.supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
        self.service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        self.anon_key = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
        self.ready = bool(self.supabase_url and self.service_key)

        if self.ready:
            logger.info("Auth service initialized (direct REST API mode)")
        else:
            logger.warning("Auth service NOT ready — missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")

    def _validate_email(self, email: str) -> bool:
        return bool(re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', email))

    def _validate_phone(self, phone: str) -> bool:
        return bool(re.match(r'^\+[1-9]\d{6,14}$', phone))

    def _admin_headers(self) -> dict:
        return {
            "apikey": self.service_key,
            "Authorization": f"Bearer {self.service_key}",
            "Content-Type": "application/json"
        }

    def _anon_headers(self) -> dict:
        return {
            "apikey": self.anon_key,
            "Content-Type": "application/json"
        }

    async def send_email_otp(self, email: str, client_ip: str = "unknown") -> Dict[str, Any]:
        if not self._validate_email(email):
            return {"success": False, "error": "Invalid email format"}
        if _check_rate_limit(f"email_otp:{email}") or _check_rate_limit(f"ip_otp:{client_ip}"):
            return {"success": False, "error": "Too many OTP requests. Please wait 5 minutes."}
        if not self.ready:
            return {"success": False, "error": "Auth service not configured"}

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"{self.supabase_url}/auth/v1/otp",
                    headers=self._anon_headers(),
                    json={"email": email}
                )
                if resp.status_code in (200, 201):
                    logger.info(f"Email OTP sent to {email}")
                    return {"success": True, "message": "OTP sent to your email"}
                else:
                    error_data = resp.json()
                    error_msg = error_data.get("error_description") or error_data.get("msg") or error_data.get("message", "Unknown error")
                    logger.error(f"Email OTP failed: {error_msg}")
                    return {"success": False, "error": error_msg}
        except Exception as e:
            logger.error(f"Email OTP exception: {str(e)}")
            return {"success": False, "error": "Network error. Please try again."}

    async def send_phone_otp(self, phone: str, client_ip: str = "unknown") -> Dict[str, Any]:
        if not self._validate_phone(phone):
            return {"success": False, "error": "Invalid phone number. Use format: +919876543210"}
        if _check_rate_limit(f"phone_otp:{phone}") or _check_rate_limit(f"ip_otp:{client_ip}"):
            return {"success": False, "error": "Too many OTP requests. Please wait 5 minutes."}
        if not self.ready:
            return {"success": False, "error": "Auth service not configured"}

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"{self.supabase_url}/auth/v1/otp",
                    headers=self._anon_headers(),
                    json={"phone": phone}
                )
                if resp.status_code in (200, 201):
                    logger.info(f"Phone OTP sent to {phone}")
                    return {"success": True, "message": "OTP sent to your phone"}
                else:
                    error_data = resp.json()
                    error_msg = error_data.get("error_description") or error_data.get("msg") or error_data.get("message", "Unknown error")
                    return {"success": False, "error": error_msg}
        except Exception as e:
            logger.error(f"Phone OTP exception: {str(e)}")
            return {"success": False, "error": "Network error. Please try again."}

    async def verify_otp(self, token: str, otp_type: str = "email", email: str = None, phone: str = None) -> Dict[str, Any]:
        if not self.ready:
            return {"success": False, "error": "Auth service not configured"}
        if not token or len(token) != 6:
            return {"success": False, "error": "OTP must be exactly 6 digits"}

        try:
            payload = {"token": token, "type": otp_type}
            if otp_type == "email" and email:
                payload["email"] = email
            elif otp_type == "sms" and phone:
                payload["phone"] = phone
            else:
                return {"success": False, "error": "Must provide email or phone"}

            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"{self.supabase_url}/auth/v1/verify",
                    headers=self._anon_headers(),
                    json=payload
                )
                if resp.status_code == 200:
                    data = resp.json()
                    logger.info(f"OTP verified successfully")
                    return {
                        "success": True,
                        "user": data.get("user"),
                        "session": {
                            "access_token": data.get("access_token"),
                            "refresh_token": data.get("refresh_token"),
                        }
                    }
                else:
                    error_data = resp.json()
                    error_msg = error_data.get("error_description") or error_data.get("msg") or "Invalid or expired OTP"
                    return {"success": False, "error": error_msg}
        except Exception as e:
            logger.error(f"OTP verification exception: {str(e)}")
            return {"success": False, "error": "Verification failed. Please try again."}

    async def reset_password(self, email: str) -> Dict[str, Any]:
        if not self._validate_email(email):
            return {"success": False, "error": "Invalid email format"}
        if not self.ready:
            return {"success": False, "error": "Auth service not configured"}

        try:
            redirect_url = os.getenv("NEXT_PUBLIC_APP_URL", "http://localhost:3000") + "/reset-password"
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"{self.supabase_url}/auth/v1/recover",
                    headers=self._anon_headers(),
                    json={"email": email, "redirect_to": redirect_url}
                )
                if resp.status_code in (200, 201):
                    logger.info(f"Password reset email sent to {email}")
                    return {"success": True, "message": "Password reset link sent to your email"}
                else:
                    error_data = resp.json()
                    error_msg = error_data.get("error_description") or error_data.get("msg") or "Failed to send reset email"
                    return {"success": False, "error": error_msg}
        except Exception as e:
            logger.error(f"Password reset exception: {str(e)}")
            return {"success": False, "error": "Network error. Please try again."}

    async def get_user(self, access_token: str) -> Dict[str, Any]:
        if not self.ready:
            return {"success": False, "error": "Auth service not configured"}

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{self.supabase_url}/auth/v1/user",
                    headers={
                        "apikey": self.service_key,
                        "Authorization": f"Bearer {access_token}",
                    }
                )
                if resp.status_code == 200:
                    user = resp.json()
                    return {
                        "success": True,
                        "user": {
                            "id": user.get("id"),
                            "email": user.get("email"),
                            "phone": user.get("phone"),
                            "full_name": user.get("user_metadata", {}).get("full_name", ""),
                            "avatar_url": user.get("user_metadata", {}).get("avatar_url", ""),
                            "created_at": user.get("created_at"),
                        }
                    }
                else:
                    return {"success": False, "error": "Invalid or expired session"}
        except Exception as e:
            logger.error(f"Get user exception: {str(e)}")
            return {"success": False, "error": "Failed to get user info"}


auth_service = AuthService()
