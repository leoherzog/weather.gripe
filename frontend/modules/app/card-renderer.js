// Card rendering for the app

import { WeatherCards } from '../cards/index.js';
import { attachLightboxHandler } from '../ui/lightbox.js';

// Create card renderer with dependency injection
export function createCardRenderer(app) {
  // Track current render to cancel stale renders when location changes rapidly
  let currentRenderVersion = 0;

  return {
    // Render all weather cards
    async renderAllCards(weather, alerts = [], wxStory = null, locationName = null) {
      // Increment render version - any in-flight renders with older versions will be discarded
      const thisRenderVersion = ++currentRenderVersion;
      const daily = weather?.daily || [];

      // Extract just the city name (before comma) for card labels
      const cityName = locationName?.split(',')[0]?.trim() || null;

      // Extract region (state/province) from location name for Unsplash fallback
      // locationName format: "City, State, Country" or "City, Country"
      const locationParts = locationName?.split(',').map(p => p.trim()) || [];
      const regionName = locationParts.length > 1 ? locationParts[1] : null;
      const bgLocationOpts = { location: cityName, region: regionName };

      // Get timezone from weather data for displaying location's local time
      const timezone = weather?.timezone || null;

      // Determine if NWS data with detailed forecasts
      const isNWS = weather.source === 'nws';

      // Determine night mode: after sunset OR today's high is missing
      const now = new Date();
      const todaySunset = daily[0]?.sunset ? new Date(daily[0].sunset) : null;
      const isAfterSunset = todaySunset && now > todaySunset;
      const isMissingTodayHigh = daily[0]?.high == null;
      const isNightMode = isAfterSunset || isMissingTodayHigh;

      // Get background image based on current conditions and temperature (start fetch early)
      // Uses cascading fallback: location+condition -> region+condition -> condition only
      const conditionQuery = WeatherCards.getConditionQuery(weather.current.condition, weather.current.temperature);
      const backgroundPromise = app.weatherLoader.fetchBackground(conditionQuery, bgLocationOpts);

      // Start radar fetch early for US locations (parallel with background)
      const radarPromise = isNWS ? app.weatherLoader.fetchRadar(app.currentLocation?.lat, app.currentLocation?.lon) : null;

      // For detailed cards, fetch backgrounds based on their specific conditions and temps
      let detailedBg1Promise = null;
      let detailedBg2Promise = null;
      if (isNWS) {
        if (isNightMode) {
          // Tonight + Tomorrow
          const tonightForecast = daily[0]?.nightForecast;
          const tomorrowForecast = daily[1]?.dayForecast;
          if (tonightForecast?.condition) {
            detailedBg1Promise = app.weatherLoader.fetchBackground(WeatherCards.getConditionQuery(tonightForecast.condition, daily[0]?.low), bgLocationOpts);
          }
          if (tomorrowForecast?.condition) {
            detailedBg2Promise = app.weatherLoader.fetchBackground(WeatherCards.getConditionQuery(tomorrowForecast.condition, daily[1]?.high), bgLocationOpts);
          }
        } else {
          // Today + Tonight
          const todayForecast = daily[0]?.dayForecast;
          const tonightForecast = daily[0]?.nightForecast;
          if (todayForecast?.condition) {
            detailedBg1Promise = app.weatherLoader.fetchBackground(WeatherCards.getConditionQuery(todayForecast.condition, daily[0]?.high), bgLocationOpts);
          }
          if (tonightForecast?.condition) {
            detailedBg2Promise = app.weatherLoader.fetchBackground(WeatherCards.getConditionQuery(tonightForecast.condition, daily[0]?.low), bgLocationOpts);
          }
        }
      }

      // Render all cards in parallel, then sort by order and append
      const cardPromises = [];

      // Alert cards (order: 0.x)
      // Uses map-based cards for alerts with polygon/zone geometry, falls back to text cards
      alerts.forEach((alert, i) => {
        cardPromises.push((async () => {
          // Try map-based card if alert has polygon geometry
          let geometry = alert.geometry;

          // If no direct geometry but has affected zones, fetch zone geometries
          if (!geometry && alert.affectedZones && alert.affectedZones.length > 0) {
            try {
              const zonesParam = alert.affectedZones.join(',');
              const response = await fetch(`/api/zones?zones=${encodeURIComponent(zonesParam)}`);
              if (response.ok) {
                geometry = await response.json();
              }
            } catch (e) {
              console.warn('Failed to fetch zone geometries:', e);
            }
          }

          // Try map card with geometry (direct or from zones)
          if (geometry) {
            try {
              const alertWithGeometry = { ...alert, geometry };
              const mapCard = await WeatherCards.createAlertMapCard(alertWithGeometry, app.currentLocation, timezone);
              if (mapCard) {
                return { order: 0 + i * 0.1, card: mapCard };
              }
            } catch (e) {
              console.warn('Alert map card failed, falling back to text card:', e);
            }
          }

          // Fall back to text-based card
          const canvas = document.createElement('canvas');
          await WeatherCards.renderAlert(canvas, {
            event: alert.event,
            severity: alert.severity,
            urgency: alert.urgency,
            onset: alert.onset,
            ends: alert.ends,
            instruction: alert.instruction,
            description: alert.description,
            senderName: alert.senderName
          }, timezone);
          return { order: 0 + i * 0.1, card: WeatherCards.createCardContainer(canvas, 'alert') };
        })());
      });

      // Current conditions card (order: 1, depends on background)
      cardPromises.push((async () => {
        const background = await backgroundPromise;
        const canvas = document.createElement('canvas');
        await WeatherCards.renderCurrentConditions(canvas, weather, background?.url, background?.username, timezone);
        const card = WeatherCards.createCardContainer(canvas, 'current');
        this.addPhotoAttribution(card, background);
        return { order: 1, card };
      })());

      // Detailed forecast cards (NWS only, order: 2-3, depend on their backgrounds)
      if (isNWS) {
        if (isNightMode) {
          // Tonight card (order: 2)
          const tonightForecast = daily[0]?.nightForecast;
          if (tonightForecast?.detailedForecast) {
            cardPromises.push((async () => {
              const detailedBg1 = detailedBg1Promise ? await detailedBg1Promise : null;
              const canvas = document.createElement('canvas');
              const result = await WeatherCards.renderDetailedForecast(
                canvas, tonightForecast, detailedBg1?.url, detailedBg1?.username, cityName, timezone
              );
              if (result) {
                const card = WeatherCards.createCardContainer(canvas, 'detailed-tonight');
                this.addPhotoAttribution(card, detailedBg1);
                return { order: 2, card };
              }
              return null;
            })());
          }

          // Tomorrow card (order: 3)
          const tomorrowForecast = daily[1]?.dayForecast;
          if (tomorrowForecast?.detailedForecast) {
            cardPromises.push((async () => {
              const detailedBg2 = detailedBg2Promise ? await detailedBg2Promise : null;
              const canvas = document.createElement('canvas');
              const result = await WeatherCards.renderDetailedForecast(
                canvas, tomorrowForecast, detailedBg2?.url, detailedBg2?.username, cityName, timezone
              );
              if (result) {
                const card = WeatherCards.createCardContainer(canvas, 'detailed-tomorrow');
                this.addPhotoAttribution(card, detailedBg2);
                return { order: 3, card };
              }
              return null;
            })());
          }
        } else {
          // Today card (order: 2)
          const todayForecast = daily[0]?.dayForecast;
          if (todayForecast?.detailedForecast) {
            cardPromises.push((async () => {
              const detailedBg1 = detailedBg1Promise ? await detailedBg1Promise : null;
              const canvas = document.createElement('canvas');
              const result = await WeatherCards.renderDetailedForecast(
                canvas, todayForecast, detailedBg1?.url, detailedBg1?.username, cityName, timezone
              );
              if (result) {
                const card = WeatherCards.createCardContainer(canvas, 'detailed-today');
                this.addPhotoAttribution(card, detailedBg1);
                return { order: 2, card };
              }
              return null;
            })());
          }

          // Tonight card (order: 3)
          const tonightForecast = daily[0]?.nightForecast;
          if (tonightForecast?.detailedForecast) {
            cardPromises.push((async () => {
              const detailedBg2 = detailedBg2Promise ? await detailedBg2Promise : null;
              const canvas = document.createElement('canvas');
              const result = await WeatherCards.renderDetailedForecast(
                canvas, tonightForecast, detailedBg2?.url, detailedBg2?.username, cityName, timezone
              );
              if (result) {
                const card = WeatherCards.createCardContainer(canvas, 'detailed-tonight');
                this.addPhotoAttribution(card, detailedBg2);
                return { order: 3, card };
              }
              return null;
            })());
          }
        }
      }

      // Day forecast card (order: 4, independent)
      cardPromises.push((async () => {
        const canvas = document.createElement('canvas');
        await WeatherCards.renderDayForecast(canvas, weather, timezone);
        return { order: 4, card: WeatherCards.createCardContainer(canvas, 'day') };
      })());

      // Hourly forecast card (order: 4.5, independent)
      if (weather.hourly && weather.hourly.length > 0) {
        cardPromises.push((async () => {
          const canvas = document.createElement('canvas');
          await WeatherCards.renderHourlyForecast(canvas, weather, timezone);
          return { order: 4.5, card: WeatherCards.createCardContainer(canvas, 'hourly') };
        })());
      }

      // Radar card (order: 5, depends on radar data)
      if (isNWS && radarPromise) {
        cardPromises.push((async () => {
          const radarData = await radarPromise;
          const card = await WeatherCards.createRadarCard(radarData, cityName, timezone);
          return { order: 5, card };
        })());
      }

      // Forecast graph card (order: 6, independent)
      cardPromises.push((async () => {
        const canvas = document.createElement('canvas');
        await WeatherCards.renderForecastGraph(canvas, weather, locationName, timezone);
        return { order: 6, card: WeatherCards.createCardContainer(canvas, 'forecast') };
      })());

      // Weather story cards (order: 7+)
      if (wxStory && wxStory.images.length > 0) {
        wxStory.images.forEach((image, i) => {
          cardPromises.push((async () => {
            const card = this.createWxStoryCard(image, wxStory.office, i + 1);
            return { order: 7 + i * 0.1, card };
          })());
        });
      }

      // Wait for all cards, filter nulls, sort by order, append to DOM
      const results = (await Promise.all(cardPromises)).filter(r => r !== null);
      results.sort((a, b) => a.order - b.order);

      // Check if this render is still current (a newer location update may have started)
      if (thisRenderVersion !== currentRenderVersion) {
        // This render is stale - clean up any MapLibre maps we created and discard
        results.forEach(r => {
          if (r.card._cleanup) r.card._cleanup();
        });
        return;
      }

      // Clean up any existing MapLibre maps before clearing
      this.cleanupMapCards();
      app.elements.weatherCards.innerHTML = '';
      results.forEach(r => app.elements.weatherCards.appendChild(r.card));

      // Update footer attribution based on data source
      this.updateDataSource(weather);
    },

    // Refresh cards with current data (after unit change)
    async refreshCards() {
      if (app.currentWeather) {
        await this.renderAllCards(app.currentWeather, app.currentAlerts || [], app.currentWxStory, app.currentLocation?.name);
      }
    },

    // Add photo attribution to a card
    addPhotoAttribution(card, background) {
      if (!background) return;

      // Trigger Unsplash download tracking (fire-and-forget, via our proxy)
      if (background.downloadLocation) {
        fetch(`/api/unsplash/download?url=${encodeURIComponent(background.downloadLocation)}`).catch(() => {});
      }

      const attribution = document.createElement('small');
      attribution.className = 'photo-attribution';

      // Build attribution using DOM APIs to prevent XSS
      attribution.appendChild(document.createTextNode('Photo by '));

      const photographerLink = document.createElement('a');
      photographerLink.href = `${background.photographerUrl}?utm_source=weather.gripe&utm_medium=referral`;
      photographerLink.target = '_blank';
      photographerLink.rel = 'noopener noreferrer';
      photographerLink.textContent = background.photographer;
      photographerLink.setAttribute('aria-label', `${background.photographer} on Unsplash (opens in new tab)`);
      attribution.appendChild(photographerLink);

      attribution.appendChild(document.createTextNode(' on '));

      const unsplashLink = document.createElement('a');
      unsplashLink.href = `${background.unsplashUrl}?utm_source=weather.gripe&utm_medium=referral`;
      unsplashLink.target = '_blank';
      unsplashLink.rel = 'noopener noreferrer';
      unsplashLink.textContent = 'Unsplash';
      unsplashLink.setAttribute('aria-label', 'Unsplash (opens in new tab)');
      attribution.appendChild(unsplashLink);

      // Insert before footer (goes into body slot)
      const footer = card.querySelector('[slot="footer"]');
      if (footer) {
        card.insertBefore(attribution, footer);
      } else {
        card.appendChild(attribution);
      }
    },

    // Update footer data source attribution based on weather source
    updateDataSource(weather) {
      if (!app.elements.dataSource) return;
      const isNWS = weather?.source === 'nws';
      const lat = app.currentLocation?.lat;
      const lon = app.currentLocation?.lon;
      if (isNWS) {
        const url = lat && lon
          ? `https://forecast.weather.gov/MapClick.php?lat=${lat}&lon=${lon}`
          : 'https://www.weather.gov/';
        app.elements.dataSource.innerHTML = `<a href="${url}" target="_blank" rel="noopener noreferrer" class="footer-link" aria-label="National Weather Service (opens in new tab)">NWS</a>`;
      } else {
        app.elements.dataSource.innerHTML = '<a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer" class="footer-link" aria-label="Open-Meteo weather API (opens in new tab)">Open-Meteo</a>';
      }
      if (app.elements.siteFooter) {
        app.elements.siteFooter.hidden = false;
      }
    },

    // Create a weather story card (follows same pattern as other weather cards)
    createWxStoryCard(imageUrl, office, index) {
      const container = document.createElement('wa-card');
      container.className = 'weather-card';
      container.dataset.cardType = 'wxstory';

      const img = document.createElement('img');
      img.slot = 'media';
      img.src = imageUrl;
      img.alt = `NWS ${office} Weather Story ${index}`;
      img.loading = 'lazy';
      container.appendChild(img);

      container.appendChild(WeatherCards.createCardActions(
        () => this.shareWxStoryCard(imageUrl, office, index),
        () => this.downloadWxStoryCard(imageUrl, office, index)
      ));

      // Attach lightbox click handler
      attachLightboxHandler(container);

      return container;
    },

    // Share wxstory card using Web Share API
    async shareWxStoryCard(imageUrl, office, index) {
      try {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const file = new File([blob], `wxstory-${office}-${index}.png`, { type: 'image/png' });

        await navigator.share({
          title: `NWS ${office} Weather Story`,
          files: [file]
        });
      } catch (e) {
        if (e.name !== 'AbortError') {
          console.error('Share failed:', e);
          this.downloadWxStoryCard(imageUrl, office, index);
        }
      }
    },

    // Download wxstory card as image
    downloadWxStoryCard(imageUrl, office, index) {
      const link = document.createElement('a');
      link.download = `wxstory-${office}-${index}.png`;
      link.href = imageUrl;
      link.click();
    },

    // Clean up MapLibre maps in radar and alert-map cards before removing them
    cleanupMapCards() {
      const mapCards = app.elements.weatherCards.querySelectorAll('[data-card-type="radar"], [data-card-type="alert-map"]');
      mapCards.forEach(card => {
        if (card._cleanup) {
          card._cleanup();
        }
      });
    }
  };
}
