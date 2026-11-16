import { z } from 'zod';
import { missingCredential, type ToolCallOptions } from './toolCall.js';

export const weatherToolSchema = z.object({
  location: z.string(),
});

export type WeatherInput = z.infer<typeof weatherToolSchema>;

export interface WeatherResult {
  success: boolean;
  temperature?: number;
  conditions?: string;
  location?: string;
  error?: string;
}

export async function fetchWeather(
  input: WeatherInput,
  options: ToolCallOptions,
): Promise<WeatherResult> {
  const { apiKey, fetch: fetchFn = globalThis.fetch, signal } = options;
  if (!apiKey) {
    return missingCredential('WEATHER_API_KEY');
  }
  const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(input.location)}&units=imperial&appid=${apiKey}`;

  try {
    const response = await fetchFn(url, { signal });
    if (!response.ok) {
      return {
        success: false,
        error: `Weather API returned ${response.status} ${response.statusText}`,
      };
    }

    const data = (await response.json()) as {
      main: { temp: number };
      weather: Array<{ description: string }>;
      name: string;
    };

    return {
      success: true,
      temperature: data.main.temp,
      conditions: data.weather[0]?.description ?? 'unknown',
      location: data.name,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error fetching weather',
    };
  }
}
