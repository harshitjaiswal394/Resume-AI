from fastapi import APIRouter, HTTPException, Depends, Body
from typing import Dict, Any, Optional
from app.db import engine
from sqlalchemy import text
from app.api.auth import get_current_user
import logging

router = APIRouter()
logger = logging.getLogger("resumatch-api.users")

@router.get("/me")
async def get_my_profile(user_id: str = Depends(get_current_user)):
    """Fetches the profile for the authenticated user."""
    try:
        with engine.connect() as conn:
            result = conn.execute(
                text("SELECT * FROM users WHERE id = :uid"),
                {"uid": user_id}
            ).fetchone()
            
            if not result:
                return {"success": False, "error": "Profile not found"}
                
            profile = dict(result._asdict())
            # Convert snake_case to camelCase for frontend expectations if needed, 
            # but usually frontend matches DB here.
            return {"success": True, "profile": profile}
    except Exception as e:
        logger.error(f"Error fetching profile: {str(e)}")
        raise HTTPException(status_code=500, detail="Database error")

@router.post("/me")
async def upsert_my_profile(
    payload: Dict[str, Any] = Body(...),
    user_id: str = Depends(get_current_user)
):
    """Creates or updates the profile for the authenticated user."""
    email = payload.get("email")
    full_name = payload.get("full_name") or payload.get("fullName", "")
    avatar_url = payload.get("avatar_url") or payload.get("avatarUrl", "")
    
    try:
        with engine.begin() as conn:
            # Check if exists
            exists = conn.execute(
                text("SELECT id FROM users WHERE id = :uid"),
                {"uid": user_id}
            ).fetchone()
            
            if exists:
                conn.execute(
                    text("""
                        UPDATE users 
                        SET full_name = :name, avatar_url = :avatar, updated_at = NOW()
                        WHERE id = :uid
                    """),
                    {"name": full_name, "avatar": avatar_url, "uid": user_id}
                )
            else:
                conn.execute(
                    text("""
                        INSERT INTO users (id, email, full_name, avatar_url, plan, credits_remaining)
                        VALUES (:uid, :email, :name, :avatar, 'free', 3)
                    """),
                    {"uid": user_id, "email": email, "name": full_name, "avatar": avatar_url}
                )
        
        return {"success": True}
    except Exception as e:
        logger.error(f"Error upserting profile: {str(e)}")
        raise HTTPException(status_code=500, detail="Database error")

@router.patch("/me/plan")
async def update_user_plan(
    payload: Dict[str, Any] = Body(...),
    user_id: str = Depends(get_current_user)
):
    """Updates the user's plan (e.g. to 'pro' after payment)."""
    plan = payload.get("plan", "free")
    credits = payload.get("credits", 3)
    
    try:
        with engine.begin() as conn:
            conn.execute(
                text("""
                    UPDATE users 
                    SET plan = :plan, credits_remaining = :credits, updated_at = NOW()
                    WHERE id = :uid
                """),
                {"plan": plan, "credits": credits, "uid": user_id}
            )
        return {"success": True}
    except Exception as e:
        logger.error(f"Error updating plan: {str(e)}")
        raise HTTPException(status_code=500, detail="Database error")
