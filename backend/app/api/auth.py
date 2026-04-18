import os
import logging
import httpx
import json
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from typing import Optional
from dotenv import load_dotenv

load_dotenv('backend/.env')

logger = logging.getLogger("resumatch-api.auth")

# FastAPI security scheme
security = HTTPBearer()

# GCP Identity Platform (Firebase) configuration
FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID") or os.getenv("GCP_PROJECT_ID")
ISS_URL = f"https://securetoken.google.com/{FIREBASE_PROJECT_ID}"
AUD_URL = FIREBASE_PROJECT_ID

# Cache for GCP public keys
_GCP_PUB_KEYS = {}
_LAST_KEY_FETCH = 0

async def get_gcp_public_keys():
    """Fetches public keys from Google to verify Identity tokens."""
    global _GCP_PUB_KEYS
    if _GCP_PUB_KEYS:
        return _GCP_PUB_KEYS
        
    url = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url)
            _GCP_PUB_KEYS = response.json()
            return _GCP_PUB_KEYS
    except Exception as e:
        logger.error(f"Failed to fetch GCP public keys: {str(e)}")
        return {}

async def get_current_user(token: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """
    Decodes and validates a GCP Identity Platform JWT.
    Returns the user_id (sub).
    """
    if not FIREBASE_PROJECT_ID:
        # Fallback for development if no project ID is set
        logger.warning("FIREBASE_PROJECT_ID not set. Auth will be bypassed or fail.")
        return "development_user"

    jwt_token = token.credentials
    try:
        # 1. Fetch public keys
        public_keys = await get_gcp_public_keys()
        
        # 2. Decode header to find key id (kid)
        header = jwt.get_unverified_header(jwt_token)
        kid = header.get('kid')
        if not kid or kid not in public_keys:
            raise HTTPException(status_code=401, detail="Invalid token kid")
            
        # 3. Verify JWT
        # In Identity Platform, the issuer is always securetoken.google.com/PROJECT_ID
        # The audience is the project ID
        payload = jwt.decode(
            jwt_token, 
            public_keys[kid], 
            algorithms=['RS256'],
            audience=AUD_URL,
            issuer=ISS_URL
        )
        
        # 4. Extract User ID
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Token missing subject (user_id)")
            
        return user_id
        
    except JWTError as e:
        logger.error(f"JWT Verification failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as e:
        logger.error(f"Unexpected Auth Error: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal Auth Error")
