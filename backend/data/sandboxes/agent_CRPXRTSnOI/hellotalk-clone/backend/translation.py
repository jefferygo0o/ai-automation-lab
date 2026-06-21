"""Translation engine for HelloTalk Clone

Supports pluggable translation backends:
1. LibreTranslate (self-hosted, free)
2. Google Translate (via unofficial API)
3. Simulated (for demo/offline use)
"""
import json
import random
import httpx
from typing import Optional

# Try to import Google Translate, fall back to simulation
try:
    from googletrans import Translator as GoogleTranslator
    HAS_GOOGLETRANS = True
except ImportError:
    HAS_GOOGLETRANS = False

# Language code mapping for display
LANGUAGE_NAMES = {
    "en": "English", "es": "Spanish", "fr": "French", "de": "German",
    "it": "Italian", "pt": "Portuguese", "ru": "Russian", "zh": "Chinese",
    "ja": "Japanese", "ko": "Korean", "ar": "Arabic", "tr": "Turkish",
    "hi": "Hindi", "th": "Thai", "vi": "Vietnamese", "nl": "Dutch",
    "pl": "Polish", "sv": "Swedish", "da": "Danish", "fi": "Finnish",
    "cs": "Czech", "hu": "Hungarian", "ro": "Romanian", "el": "Greek",
    "he": "Hebrew", "id": "Indonesian", "ms": "Malay", "tl": "Tagalog",
}

# Simulated phrase translations for demo purposes
SIMULATED_TRANSLATIONS = {
    ("en", "es"): {
        "hello": "hola", "how are you": "cómo estás", "good morning": "buenos días",
        "thank you": "gracias", "please": "por favor", "yes": "sí", "no": "no",
        "I love learning languages": "Me encanta aprender idiomas",
        "can you help me": "¿puedes ayudarme?", "what is your name": "¿cómo te llamas?",
        "nice to meet you": "mucho gusto", "where are you from": "¿de dónde eres?",
        "I am learning Spanish": "Estoy aprendiendo español",
        "do you speak English": "¿hablas inglés?",
        "I don't understand": "no entiendo",
        "can you repeat that": "¿puedes repetir eso?",
        "how do you say": "cómo se dice",
        "what does this mean": "qué significa esto",
        "that's interesting": "eso es interesante",
        "tell me about yourself": "cuéntame sobre ti",
    },
    ("en", "ja"): {
        "hello": "こんにちは", "how are you": "お元気ですか", "good morning": "おはようございます",
        "thank you": "ありがとう", "please": "お願いします", "yes": "はい", "no": "いいえ",
        "I love learning languages": "言語を学ぶのが大好きです",
        "can you help me": "手伝ってくれますか？",
        "nice to meet you": "はじめまして",
        "I am learning Japanese": "日本語を勉強しています",
    },
    ("en", "ko"): {
        "hello": "안녕하세요", "thank you": "감사합니다", "yes": "네", "no": "아니요",
        "nice to meet you": "만나서 반갑습니다",
        "I am learning Korean": "한국어를 배우고 있습니다",
        "how are you": "어떻게 지내세요?",
    },
    ("en", "fr"): {
        "hello": "bonjour", "how are you": "comment allez-vous", "good morning": "bonjour",
        "thank you": "merci", "please": "s'il vous plaît", "yes": "oui", "no": "non",
        "I love learning languages": "J'adore apprendre les langues",
        "nice to meet you": "enchanté",
        "I am learning French": "J'apprends le français",
    },
    ("en", "zh"): {
        "hello": "你好", "thank you": "谢谢", "yes": "是", "no": "不是",
        "nice to meet you": "很高兴认识你",
        "I am learning Chinese": "我在学习中文",
        "how are you": "你好吗",
    },
    ("es", "en"): {
        "hola": "hello", "cómo estás": "how are you", "gracias": "thank you",
        "por favor": "please", "sí": "yes", "no": "no",
        "Me encanta aprender idiomas": "I love learning languages",
        "mucho gusto": "nice to meet you",
        "Estoy aprendiendo español": "I am learning Spanish",
    },
}


class TranslationService:
    """Handles translation between languages."""

    def __init__(self):
        self.libretranslate_url = None  # Set to "http://localhost:5000" if running LibreTranslate
        self.google_translator = GoogleTranslator() if HAS_GOOGLETRANS else None

    async def translate(self, text: str, source: str, target: str) -> str:
        """Translate text from source to target language."""
        if source == target:
            return text

        # Try LibreTranslate first if configured
        if self.libretranslate_url:
            try:
                return await self._libretranslate(text, source, target)
            except Exception:
                pass

        # Try Google Translate if available
        if self.google_translator:
            try:
                return await self._google_translate(text, source, target)
            except Exception:
                pass

        # Fall back to simulated translations
        return self._simulate_translate(text, source, target)

    async def _libretranslate(self, text: str, source: str, target: str) -> str:
        """Translate via LibreTranslate API."""
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.libretranslate_url}/translate",
                json={
                    "q": text,
                    "source": source if source != "auto" else "auto",
                    "target": target,
                },
                timeout=10,
            )
            resp.raise_for_status()
            return resp.json()["translatedText"]

    async def _google_translate(self, text: str, source: str, target: str) -> str:
        """Translate via Google Translate."""
        src = source if source != "auto" else None
        result = self.google_translator.translate(text, dest=target, src=src)
        return result.text

    def _simulate_translate(self, text: str, source: str, target: str) -> str:
        """Simulated translation for demo purposes."""
        key = (source, target)
        reverse_key = (target, source)
        lower_text = text.lower().strip()

        # Check exact matches
        if key in SIMULATED_TRANSLATIONS:
            if lower_text in SIMULATED_TRANSLATIONS[key]:
                return SIMULATED_TRANSLATIONS[key][lower_text]

        # Check reverse direction
        if reverse_key in SIMULATED_TRANSLATIONS:
            # Find the English version
            for eng, trans in SIMULATED_TRANSLATIONS[reverse_key].items():
                if trans.lower() == lower_text:
                    return eng

        # If text starts with known patterns, translate accordingly
        for (src, tgt), translations in SIMULATED_TRANSLATIONS.items():
            if src == source and tgt == target:
                for eng, trans in translations.items():
                    if eng in lower_text or lower_text in eng:
                        return lower_text.replace(eng, trans).capitalize() if lower_text[0].isupper() else lower_text.replace(eng, trans)

        # Fallback: append a note
        source_name = LANGUAGE_NAMES.get(source, source)
        target_name = LANGUAGE_NAMES.get(target, target)
        return f"[{source_name} → {target_name}] {text}"


# Global translation service
translation_service = TranslationService()
