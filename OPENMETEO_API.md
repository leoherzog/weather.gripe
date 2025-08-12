# OpenMeteo API Integration

This document describes the OpenMeteo weather API integration in Weather.gripe.

## Overview

Weather.gripe uses the OpenMeteo API to provide global weather coverage with:
- Free tier with generous limits
- No API key required
- Global coverage (not limited to specific countries)
- Bulk request support for efficiency
- WMO standardized weather codes

## API Endpoints

### Forecast Endpoint
```
https://api.open-meteo.com/v1/forecast
```

### Request Parameters

#### Required Parameters
- `latitude`: Decimal coordinate (can be comma-separated for bulk)
- `longitude`: Decimal coordinate (can be comma-separated for bulk)

#### Configuration Parameters
- `forecast_days`: Number of days (default: 2 for today/tomorrow)
- `timezone`: Set to "auto" for location-based timezone
- `temperature_unit`: "fahrenheit" 
- `wind_speed_unit`: "mph"
- `precipitation_unit`: "inch"

#### Data Parameters
- `current`: Current conditions (temperature, humidity, weather code, etc.)
- `daily`: Daily aggregates (min/max temps, precipitation sums, etc.)
- `hourly`: Hourly forecasts (detailed conditions throughout the day)

## Data Structure

### Single Location Response
```json
{
  "latitude": 40.7128,
  "longitude": -74.0060,
  "timezone": "America/New_York",
  "current": {
    "time": "2024-01-01T12:00",
    "temperature_2m": 72.5,
    "weather_code": 2
  },
  "daily": {
    "time": ["2024-01-01", "2024-01-02"],
    "weather_code": [2, 0],
    "temperature_2m_max": [75.2, 78.1],
    "temperature_2m_min": [65.3, 68.0]
  }
}
```

### Bulk Location Response
When multiple coordinates are provided, the response becomes an array:
```json
[
  { /* First location data */ },
  { /* Second location data */ },
  { /* Third location data */ }
]
```

## WMO Weather Codes

OpenMeteo uses standardized WMO codes (0-99):

| Code | Description | Emoji |
|------|-------------|-------|
| 0 | Clear sky | ☀️/🌙 |
| 1-2 | Mainly clear to partly cloudy | 🌤️/⛅ |
| 3 | Overcast | ☁️ |
| 45, 48 | Fog | 🌫️ |
| 51-57 | Drizzle (various intensities) | 🌦️ |
| 61-67 | Rain (various intensities) | 🌧️ |
| 71-77 | Snow (various intensities) | 🌨️/❄️ |
| 80-82 | Rain showers | 🌦️/🌧️ |
| 85-86 | Snow showers | 🌨️ |
| 95-99 | Thunderstorm | ⛈️ |

## Implementation Features

### Bulk Requests
Fetch weather for multiple locations in one API call:
```javascript
const forecasts = await weatherService.getForecast([
  { lat: 40.7128, lon: -74.0060 }, // New York
  { lat: 41.8781, lon: -87.6298 }, // Chicago
  { lat: 34.0522, lon: -118.2437 }  // Los Angeles
]);
```

### Alert Generation
Since OpenMeteo doesn't provide alerts, we generate them from weather conditions:
- Severe weather codes (thunderstorms, heavy snow)
- Extreme temperatures (>100°F or <0°F)
- High UV index (≥11)

### Caching Strategy
- Weather data: 6-hour TTL
- Location geocoding: 30-day TTL
- Reduces API calls and improves response times

## Usage Examples

### Get Forecast for Single Location
```javascript
const forecast = await weatherService.getForecast(
  { lat: 40.7128, lon: -74.0060, displayName: 'New York' },
  { 
    forecastDays: 2,
    includeCurrent: true 
  }
);
```

### Process Daily Forecast
```javascript
const daily = forecast.daily[0];
console.log(`${daily.date}: ${daily.description}`);
console.log(`High: ${daily.temperatureMax}°F, Low: ${daily.temperatureMin}°F`);
console.log(`Precipitation: ${daily.precipitationSum} inches`);
```

### Generate Weather Emoji
```javascript
const emoji = weatherService.getWeatherEmoji(
  daily.weatherCode,
  isDay
);
```

## Rate Limits

OpenMeteo has generous rate limits:
- No hard rate limit specified
- Reasonable use expected
- Commercial use requires subscription

## Advantages Over NWS API

| Feature | OpenMeteo | NWS |
|---------|-----------|-----|
| Coverage | Global | US only |
| API Key | Not required | Not required |
| Bulk Requests | Native support | Not supported |
| Response Format | Simple JSON | Complex nested JSON |
| Grid System | Not needed | Required |
| International | Full support | None |

## Error Handling

Common error scenarios:
- Invalid coordinates: Returns 400 error
- Rate limit exceeded: Returns 429 (rare)
- Server errors: Returns 5xx

All errors are caught and logged:
```javascript
try {
  const forecast = await weatherService.getForecast(location);
} catch (error) {
  logger.error('Failed to fetch forecast', { error });
  // Serve cached data if available
}
```

## Testing

Integration tests verify:
- Single location forecasts
- Bulk location requests
- International locations
- Alert generation from weather codes
- Error handling

Run tests:
```bash
npm test -- tests/integration/weather-flow.test.js
```

## Future Enhancements

- [ ] Add historical weather data support
- [ ] Implement air quality data
- [ ] Add marine/coastal forecasts
- [ ] Support for weather maps/radar
- [ ] Implement precipitation probability in posts