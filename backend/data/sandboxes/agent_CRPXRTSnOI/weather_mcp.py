#!/usr/bin/env python3
"""
Weather API MCP Server

Provides weather data tools via the Model Context Protocol.
Uses the free Open-Meteo API (no API key required).
"""

import json
import sys
from urllib.request import urlopen, Request
from urllib.error import URLError

from fastmcp import FastMCP

# ── MCP Server setup ──────────────────────────────────────────
mcp = FastMCP("Weather API")

# ── API endpoints ─────────────────────────────────────────────
GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search?name={city}&count=1&language=en&format=json"
WEATHER_URL = (
    "https://api.open-meteo.com/v1/forecast?"
    "latitude={lat}&longitude={lon}"
    "&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,pressure_msl"
    "&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum,wind_speed_10m_max"
    "&forecast_days=7&timezone=auto"
)
AIR_QUALITY_URL = (
    "https://air-quality-api.open-meteo.com/v1/air-quality?"
    "latitude={lat}&longitude={lon}"
    "&current=european_aqi,us_aqi,pm2_5,pm10,nitrogen_dioxide,ozone"
)

# Weather code mapping (WMO Weather interpretation codes)
WMO_CODES = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Light freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snow fall",
    73: "Moderate snow fall",
    75: "Heavy snow fall",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
}


# ── Helper functions ──────────────────────────────────────────

def _fetch_json(url: str) -> dict:
    """Fetch a URL and return parsed JSON, or raise on failure."""
    req = Request(url, headers={"User-Agent": "WeatherMCP/1.0"})
    try:
        with urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode())
    except URLError as e:
        raise RuntimeError(f"API request failed: {e.reason}") from e
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Invalid JSON response: {e}") from e


def _geocode(city: str) -> tuple[float, float, str, str]:
    """Convert a city name to (lat, lon, name, country)."""
    data = _fetch_json(GEOCODING_URL.format(city=city.replace(" ", "%20")))
    results = data.get("results")
    if not results:
        raise ValueError(f"City '{city}' not found. Try a more specific name (e.g. 'London, UK').")
    r = results[0]
    return r["latitude"], r["longitude"], r["name"], r.get("country", "")


def _describe_weather(code: int | None) -> str:
    """Return a human-readable weather description from a WMO code."""
    if code is None:
        return "Unknown"
    return WMO_CODES.get(code, f"Code {code}")


# ── Tools ─────────────────────────────────────────────────────

@mcp.tool()
def get_current_weather(city: str) -> str:
    """Get the current weather conditions for a city.

    Args:
        city: City name (e.g. 'London', 'Tokyo, JP', 'New York').

    Returns:
        A human-readable summary of current weather.
    """
    lat, lon, name, country = _geocode(city)
    data = _fetch_json(WEATHER_URL.format(lat=lat, lon=lon))
    current = data.get("current", {})

    temp = current.get("temperature_2m")
    feels_like = current.get("apparent_temperature")
    humidity = current.get("relative_humidity_2m")
    wind = current.get("wind_speed_10m")
    pressure = current.get("pressure_msl")
    wmo_code = current.get("weather_code")

    lines = [
        f"🌤️  Current weather in {name}, {country}",
        f"   Temperature: {temp}°C (feels like {feels_like}°C)" if temp is not None and feels_like is not None else "",
        f"   Conditions: {_describe_weather(wmo_code)}",
        f"   Humidity: {humidity}%" if humidity is not None else "",
        f"   Wind: {wind} km/h" if wind is not None else "",
        f"   Pressure: {pressure} hPa" if pressure is not None else "",
    ]
    return "\n".join(line for line in lines if line)


@mcp.tool()
def get_forecast(city: str, days: int = 3) -> str:
    """Get a multi-day weather forecast for a city.

    Args:
        city: City name (e.g. 'London', 'Tokyo, JP').
        days: Number of days to forecast (1-7, default 3).

    Returns:
        A human-readable forecast summary.
    """
    days = max(1, min(7, days))
    lat, lon, name, country = _geocode(city)
    url = WEATHER_URL.format(lat=lat, lon=lon) + f"&forecast_days={days}"
    data = _fetch_json(url)
    daily = data.get("daily", {})

    dates = daily.get("time", [])
    temps_max = daily.get("temperature_2m_max", [])
    temps_min = daily.get("temperature_2m_min", [])
    precip = daily.get("precipitation_sum", [])
    wind = daily.get("wind_speed_10m_max", [])
    codes = daily.get("weather_code", [])

    lines = [f"📅 {days}-day forecast for {name}, {country}\n"]
    for i in range(len(dates)):
        condition = _describe_weather(codes[i] if i < len(codes) else None)
        lines.append(
            f"  {dates[i]}: {temps_min[i]}–{temps_max[i]}°C, "
            f"{condition}, "
            f"🌧️ {precip[i]}mm, "
            f"💨 {wind[i]} km/h"
        )
    return "\n".join(lines)


@mcp.tool()
def get_air_quality(city: str) -> str:
    """Get the current air quality index for a city.

    Args:
        city: City name (e.g. 'London', 'Tokyo, JP').

    Returns:
        A human-readable air quality summary.
    """
    lat, lon, name, country = _geocode(city)
    data = _fetch_json(AIR_QUALITY_URL.format(lat=lat, lon=lon))
    current = data.get("current", {})

    def aqi_label(val: float | None) -> str:
        if val is None:
            return "N/A"
        if val <= 50:
            return "Good"
        elif val <= 100:
            return "Moderate"
        elif val <= 150:
            return "Unhealthy for Sensitive Groups"
        elif val <= 200:
            return "Unhealthy"
        elif val <= 300:
            return "Very Unhealthy"
        else:
            return "Hazardous"

    eu_aqi = current.get("european_aqi")
    us_aqi = current.get("us_aqi")
    pm25 = current.get("pm2_5")
    pm10 = current.get("pm10")
    no2 = current.get("nitrogen_dioxide")
    o3 = current.get("ozone")

    lines = [
        f"🌬️  Air Quality in {name}, {country}",
        f"   European AQI: {eu_aqi} ({aqi_label(eu_aqi)})" if eu_aqi is not None else "",
        f"   US AQI:       {us_aqi} ({aqi_label(us_aqi)})" if us_aqi is not None else "",
        f"   PM2.5:        {pm25} μg/m³" if pm25 is not None else "",
        f"   PM10:         {pm10} μg/m³" if pm10 is not None else "",
        f"   NO₂:          {no2} μg/m³" if no2 is not None else "",
        f"   O₃:           {o3} μg/m³" if o3 is not None else "",
    ]
    return "\n".join(line for line in lines if line)


@mcp.tool()
def get_weather_summary(city: str) -> str:
    """Get a comprehensive weather summary for a city including current conditions,
    today's forecast, and air quality. All in one call.

    Args:
        city: City name (e.g. 'London', 'Tokyo, JP').

    Returns:
        A complete weather briefing.
    """
    lat, lon, name, country = _geocode(city)
    weather_data = _fetch_json(WEATHER_URL.format(lat=lat, lon=lon))
    aq_data = _fetch_json(AIR_QUALITY_URL.format(lat=lat, lon=lon))

    current = weather_data.get("current", {})
    daily = weather_data.get("daily", {})

    # Current conditions
    temp = current.get("temperature_2m")
    feels_like = current.get("apparent_temperature")
    humidity = current.get("relative_humidity_2m")
    wind = current.get("wind_speed_10m")
    wmo_code = current.get("weather_code")

    # Today's highs/lows
    today_idx = 0
    today_max = daily.get("temperature_2m_max", [None])[today_idx] if daily.get("temperature_2m_max") else None
    today_min = daily.get("temperature_2m_min", [None])[today_idx] if daily.get("temperature_2m_min") else None
    today_precip = daily.get("precipitation_sum", [None])[today_idx] if daily.get("precipitation_sum") else None

    # Air quality
    aqi = aq_data.get("current", {}).get("us_aqi")

    lines = [
        f"━━━ Weather Briefing for {name}, {country} ━━━",
        f"",
        f"🌡️  Now: {temp}°C (feels like {feels_like}°C) — {_describe_weather(wmo_code)}",
        f"📊 Today: {today_min if today_min else '?'}°C → {today_max if today_max else '?'}°C, 🌧️ {today_precip if today_precip is not None else '?'}mm",
        f"💧 Humidity: {humidity}%  |  💨 Wind: {wind} km/h",
        f"🌬️  Air Quality (US AQI): {aqi if aqi is not None else 'N/A'}",
    ]
    return "\n".join(lines)


# ── Entry point ──────────────────────────────────────────────
if __name__ == "__main__":
    mcp.run(transport="stdio")
