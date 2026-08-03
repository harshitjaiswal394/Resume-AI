from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime
from uuid import UUID

class ChatMessageRequest(BaseModel):
    conversation_id: str = Field(..., description="The ID of the conversation")
    message: str = Field(..., description="The user's message content", min_length=1)
    selected_resume_id: Optional[str] = Field(None, description="Optional resume ID to use for this chat request")
    client_request_id: Optional[str] = Field(None, description="Optional client-generated request id for telemetry correlation")
    agent: Optional[str] = Field(None, description="Optional agent mode to route the request to a specialized workflow")

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

class MessageFeedbackRequest(BaseModel):
    message_id: str = Field(..., description="The ID of the message being rated")
    feedback: str = Field(..., description="'like' or 'dislike'")

class FeedbackPreference(BaseModel):
    value: str = Field(..., description="The preference dimension value, e.g. agent name or feature label")
    likes: int = Field(0)
    dislikes: int = Field(0)
    total: int = Field(0)
    like_rate: float = Field(0.0, description="0..1 proportion of feedback that was positive")
    samples: List[str] = Field(default_factory=list)

class FeedbackPreferencesResponse(BaseModel):
    overall_likes: int = Field(0)
    overall_dislikes: int = Field(0)
    overall_like_rate: float = Field(0.0)
    by_agent: List[FeedbackPreference] = Field(default_factory=list)
    by_provider: List[FeedbackPreference] = Field(default_factory=list)
    by_structure: List[FeedbackPreference] = Field(default_factory=list)
    by_length: List[FeedbackPreference] = Field(default_factory=list)
    top_liked_patterns: List[str] = Field(default_factory=list)
    top_disliked_patterns: List[str] = Field(default_factory=list)

