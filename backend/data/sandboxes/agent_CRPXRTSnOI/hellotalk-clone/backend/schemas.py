"""Pydantic schemas for HelloTalk Clone"""
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime


# --- Auth ---
class UserRegister(BaseModel):
    email: str
    username: str
    display_name: str
    password: str
    native_language: str = "en"
    target_language: str = "es"


class UserLogin(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    user: "UserOut"


# --- Users ---
class LanguageInfo(BaseModel):
    language_code: str
    proficiency: str  # native, fluent, intermediate, beginner
    is_target: bool = False


class UserUpdate(BaseModel):
    display_name: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    age: Optional[int] = None
    languages: Optional[List[LanguageInfo]] = None
    interests: Optional[List[str]] = None


class UserOut(BaseModel):
    id: int
    email: str
    username: str
    display_name: str
    bio: str = ""
    avatar_url: str = ""
    city: str = ""
    country: str = ""
    age: Optional[int] = None
    is_online: bool = False
    is_premium: bool = False
    languages: List[LanguageInfo] = []
    interests: List[str] = []
    created_at: datetime

    class Config:
        from_attributes = True


class UserBrief(BaseModel):
    id: int
    username: str
    display_name: str
    avatar_url: str = ""
    bio: str = ""
    country: str = ""
    is_online: bool = False
    languages: List[LanguageInfo] = []

    class Config:
        from_attributes = True


# --- Messages ---
class MessageSend(BaseModel):
    receiver_id: int
    content: str
    content_type: str = "text"
    source_language: str = "auto"
    target_language: Optional[str] = None


class MessageOut(BaseModel):
    id: int
    chat_id: int
    sender_id: int
    receiver_id: int
    content: str
    content_type: str = "text"
    media_url: Optional[str] = None
    translated_content: Optional[str] = None
    correction_json: Optional[list] = None
    is_read: bool = False
    created_at: datetime
    sender: Optional[UserBrief] = None

    class Config:
        from_attributes = True


class CorrectionSubmit(BaseModel):
    message_id: int
    original_text: str
    corrected_text: str
    explanation: str = ""


# --- Chats ---
class ChatOut(BaseModel):
    id: int
    user1_id: int
    user2_id: int
    last_message: Optional[MessageOut] = None
    partner: Optional[UserBrief] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# --- Moments ---
class MomentCreate(BaseModel):
    content: str
    image_urls: List[str] = []
    language: str = "en"


class MomentOut(BaseModel):
    id: int
    author_id: int
    content: str
    image_urls: List[str] = []
    language: str = "en"
    correction_count: int = 0
    like_count: int = 0
    comment_count: int = 0
    created_at: datetime
    author: Optional[UserBrief] = None
    corrections: List["MomentCorrectionOut"] = []
    is_liked: bool = False

    class Config:
        from_attributes = True


class MomentCorrectionOut(BaseModel):
    id: int
    moment_id: int
    user_id: int
    original_text: str = ""
    corrected_text: str = ""
    explanation: str = ""
    created_at: datetime
    user: Optional[UserBrief] = None

    class Config:
        from_attributes = True


class MomentCorrectionCreate(BaseModel):
    original_text: str
    corrected_text: str
    explanation: str = ""


class MomentCommentCreate(BaseModel):
    content: str


class MomentCommentOut(BaseModel):
    id: int
    moment_id: int
    user_id: int
    content: str
    created_at: datetime
    user: Optional[UserBrief] = None

    class Config:
        from_attributes = True


# --- Voicerooms ---
class VoiceroomCreate(BaseModel):
    title: str
    description: str = ""
    language: str = "en"
    topic: str = "General"
    max_participants: int = 20


class VoiceroomOut(BaseModel):
    id: int
    title: str
    description: str = ""
    host_id: int
    language: str = "en"
    topic: str = "General"
    is_active: bool = True
    max_participants: int = 20
    current_participants: int = 0
    created_at: datetime
    host: Optional[UserBrief] = None
    participants: List["VoiceroomParticipantOut"] = []

    class Config:
        from_attributes = True


class VoiceroomParticipantOut(BaseModel):
    id: int
    voiceroom_id: int
    user_id: int
    is_speaking: bool = False
    is_muted: bool = True
    joined_at: datetime
    user: Optional[UserBrief] = None

    class Config:
        from_attributes = True


# --- Live Streaming ---
class LiveStreamCreate(BaseModel):
    title: str
    description: str = ""
    language: str = "en"


class LiveStreamOut(BaseModel):
    id: int
    host_id: int
    title: str
    description: str = ""
    language: str = "en"
    is_live: bool = False
    viewer_count: int = 0
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    created_at: datetime
    host: Optional[UserBrief] = None

    class Config:
        from_attributes = True


# --- Notifications ---
class NotificationOut(BaseModel):
    id: int
    type: str
    title: str
    body: str = ""
    data_json: Optional[dict] = None
    is_read: bool = False
    created_at: datetime

    class Config:
        from_attributes = True


# --- Search / Partner Discovery ---
class PartnerSearch(BaseModel):
    native_language: Optional[str] = None
    target_language: Optional[str] = None
    min_age: Optional[int] = None
    max_age: Optional[int] = None
    country: Optional[str] = None
    city: Optional[str] = None
    interests: Optional[List[str]] = None
    query: Optional[str] = None
    limit: int = 20
    offset: int = 0
