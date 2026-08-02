from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime
from uuid import UUID

class ChatMessageRequest(BaseModel):
    conversation_id: str = Field(..., description="The ID of the conversation")
    message: str = Field(..., description="The user's message content", min_length=1)
    selected_resume_id: Optional[str] = Field(None, description="Optional resume ID to use for this chat request")
    client_request_id: Optional[str] = Field(None, description="Optional client-generated request id for telemetry correlation")

class ConversationCreateRequest(BaseModel):
    title: Optional[str] = Field(None, description="Optional title for the conversation")

class ConversationResponse(BaseModel):
    id: UUID
    user_id: UUID
    title: Optional[str]
    created_at: datetime
    updated_at: datetime

class MessageResponse(BaseModel):
    id: UUID
    conversation_id: UUID
    user_id: UUID
    role: str
    content: str
    metadata: Optional[Dict[str, Any]]
    created_at: datetime

class ConversationUpdateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)

