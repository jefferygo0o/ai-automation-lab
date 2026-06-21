/**
 * AuraSearch AI - Weather Tool
 *
 * Uses OpenWeatherMap free API.
 * Requires OPENWEATHER_API_KEY in .env.local.
 */

import { registerTool } from "./types";
import { config } from "@/lib/utils/env";

registerTool({
  name: "weatherTool",
  description: "Get current weather for a city or location.",
  riskLevel: "low",
  inputSchema: {
    type: "object",
    properties: {
      location: { type: "string", description: "City name or location (e.g. 'London', 'New York')" },
    },
    required: ["location"],
  },
  execute: async (input: Record<string, unknown>) => {
    const location = input.location as string;
    const apiKey = config.openweatherApiKey;

    if (!apiKey) {
      return {
        success: false,
        error:
          "Weather API key not configured. Set OPENWEATHER_API_KEY in .env.local to enable weather lookups. Free tier available at openweathermap.org.",
      };
    }

    try {
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&units=metric&appid=${apiKey}`,
        { signal: AbortSignal.timeout(10000) }
      );

      if (!response.ok) {
        if (response.status === 404) {
          return { success: false, error: `Location "${location}" not found` };
        }
        return { success: false, error: `Weather API error (${response.status})` };
      }

      const data = await response.json();

      return {
        success: true,
        data: {
          location: data.name,
          country: data.sys?.country,
          temperature: {
            current: Math.round(data.main?.temp || 0),
            feelsLike: Math.round(data.main?.feels_like || 0),
            min: Math.round(data.main?.temp_min || 0),
            max: Math.round(data.main?.temp_max || 0),
          },
          conditions: data.weather?.[0]?.description || "Unknown",
          humidity: data.main?.humidity,
          windSpeed: data.wind?.speed,
          icon: data.weather?.[0]?.icon
            ? `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`
            : undefined,
        },
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Weather lookup failed";
      return { success: false, error: `Weather lookup failed: ${msg}` };
    }
  },
});
