"""Models for HelloTalk Clone"""
import datetime
from sqlalchemy import (
    Column, Integer, String, Text, Boolean, DateTime, Float,
    ForeignKey, Table, JSON
)
from sqlalchemy.orm import relationship
from database import Base


# --- Association Tables ---
user_languages = Table(
    'user_languages', Base.metadata,
    Column('user_id', Integer, ForeignKey('users.id')),
    Column('language_code', String(10)),  # e.g., "en", "ja", "ko"
    Column('proficiency', String(20)),  # "native", "fluent", "intermediate", "beginner"
    Column('is_target', Boolean, default=False),  # True = want to learn this
)

user_interests = Table(
    'user_interests', Base.metadata,
    Column('user_id', Integer, ForeignKey('users.id')),
    Column('interest', String(50)),
)


class User(Base):
    __tablename__ = 'users'

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    username = Column(String(100), unique=True, index=True, nullable=False)
    display_name = Column(String(100), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    bio = Column(Text, default="")
    avatar_url = Column(String(500), default="")
    city = Column(String(100), default="")
    country = Column(String(100), default="")
    timezone = Column(String(50), default="UTC")
    age = Column(Integer, nullable=True)
    is_online = Column(Boolean, default=False)
    is_premium = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    # Relationships
    sent_messages = relationship("Message", foreign_keys="Message.sender_id", back_populates="sender")
    received_messages = relationship("Message", foreign_keys="Message.receiver_id", back_populates="receiver")
    moments = relationship("Moment", back_populates="author")
    voiceroom_participations = relationship("VoiceroomParticipant", back_populates="user")

    @property
    def languages(self):
        return self._languages

    @property
    def interests(self):
        return self._interests


class Chat(Base):
    __tablename__ = 'chats'

    id = Column(Integer, primary_key=True, index=True)
    user1_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    user2_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    messages = relationship("Message", back_populates="chat", order_by="Message.created_at")
    user1 = relationship("User", foreign_keys=[user1_id])
    user2 = relationship("User", foreign_keys=[user2_id])


class Message(Base):
    __tablename__ = 'messages'

    id = Column(Integer, primary_key=True, index=True)
    chat_id = Column(Integer, ForeignKey('chats.id'), nullable=False)
    sender_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    receiver_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    content = Column(Text, nullable=False)
    content_type = Column(String(20), default="text")  # text, voice, image, video
    media_url = Column(String(500))
    source_language = Column(String(10), default="auto")
    target_language = Column(String(10))
    translated_content = Column(Text)
    correction_json = Column(JSON)  # [{original, corrected, explanation}]
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    chat = relationship("Chat", back_populates="messages")
    sender = relationship("User", foreign_keys=[sender_id], back_populates="sent_messages")
    receiver = relationship("User", foreign_keys=[receiver_id], back_populates="received_messages")


class Moment(Base):
    __tablename__ = 'moments'

    id = Column(Integer, primary_key=True, index=True)
    author_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    content = Column(Text, nullable=False)
    image_urls = Column(JSON, default=list)  # array of URLs
    language = Column(String(10), default="en")  # language of the post
    correction_count = Column(Integer, default=0)
    like_count = Column(Integer, default=0)
    comment_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    author = relationship("User", back_populates="moments")
    corrections = relationship("MomentCorrection", back_populates="moment")
    likes = relationship("MomentLike", back_populates="moment")
    comments = relationship("MomentComment", back_populates="moment")


class MomentCorrection(Base):
    __tablename__ = 'moment_corrections'

    id = Column(Integer, primary_key=True, index=True)
    moment_id = Column(Integer, ForeignKey('moments.id'), nullable=False)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    original_text = Column(Text)
    corrected_text = Column(Text)
    explanation = Column(Text)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    moment = relationship("Moment", back_populates="corrections")
    user = relationship("User")


class MomentLike(Base):
    __tablename__ = 'moment_likes'

    id = Column(Integer, primary_key=True, index=True)
    moment_id = Column(Integer, ForeignKey('moments.id'), nullable=False)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    moment = relationship("Moment", back_populates="likes")
    user = relationship("User")


class MomentComment(Base):
    __tablename__ = 'moment_comments'

    id = Column(Integer, primary_key=True, index=True)
    moment_id = Column(Integer, ForeignKey('moments.id'), nullable=False)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    moment = relationship("Moment", back_populates="comments")
    user = relationship("User")


class Voiceroom(Base):
    __tablename__ = 'voicerooms'

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text)
    host_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    language = Column(String(10), default="en")
    topic = Column(String(100), default="General")
    is_active = Column(Boolean, default=True)
    max_participants = Column(Integer, default=20)
    current_participants = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    host = relationship("User")
    participants = relationship("VoiceroomParticipant", back_populates="voiceroom")


class VoiceroomParticipant(Base):
    __tablename__ = 'voiceroom_participants'

    id = Column(Integer, primary_key=True, index=True)
    voiceroom_id = Column(Integer, ForeignKey('voicerooms.id'), nullable=False)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    is_speaking = Column(Boolean, default=False)
    is_muted = Column(Boolean, default=True)
    joined_at = Column(DateTime, default=datetime.datetime.utcnow)

    voiceroom = relationship("Voiceroom", back_populates="participants")
    user = relationship("User", back_populates="voiceroom_participations")


class LiveStream(Base):
    __tablename__ = 'livestreams'

    id = Column(Integer, primary_key=True, index=True)
    host_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(Text)
    language = Column(String(10), default="en")
    is_live = Column(Boolean, default=False)
    viewer_count = Column(Integer, default=0)
    started_at = Column(DateTime)
    ended_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    host = relationship("User")


class Notification(Base):
    __tablename__ = 'notifications'

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    type = Column(String(50), nullable=False)  # message, correction, like, comment, voiceroom, system
    title = Column(String(200), nullable=False)
    body = Column(Text)
    data_json = Column(JSON)  # additional context
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User")
