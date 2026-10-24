'use client';

import 'leaflet/dist/leaflet.css';

import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap } from 'leaflet';

import { providerLocation, type Provider, type ProviderLocation } from '@/lib/api';

/**
 * Map of clinics that have published coordinates.
 *
 * Free tiles from OpenStreetMap, no API key and no third-party SDK in the
 * initial bundle: Leaflet is imported on demand inside the effect and this
 * whole module is loaded lazily (see the home page), so read-only visits
 * that never open the map never download it.
 *
 * Markers are `circleMarker`s rather than the default icon, which would need
 * Leaflet's bundled image assets rewritten for the Next asset pipeline.
 * Clinics without a location are not passed in; the caller lists them
 * beside the map.
 */

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Popups are raw HTML, so anything from the API is escaped first. */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

type Located = { provider: Provider; location: ProviderLocation };

export function ClinicMap({ providers }: { providers: Provider[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  // Leaflet loads and draws inside an async effect, where a throw would be
  // an unhandled rejection. Keeping it and throwing it during render hands
  // it to the surrounding error boundary instead (#169).
  const [failure, setFailure] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    let map: LeafletMap | null = null;

    (async () => {
      const L = await import('leaflet');
      if (cancelled || !containerRef.current) return;

      map = L.map(containerRef.current, { scrollWheelZoom: false });
      mapRef.current = map;
      L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(map);

      const located: Located[] = providers
        .map((provider) => ({ provider, location: providerLocation(provider) }))
        .filter((x): x is Located => x.location !== null);

      const bounds = L.latLngBounds([]);
      for (const { provider, location } of located) {
        bounds.extend([location.lat, location.lng]);
        L.circleMarker([location.lat, location.lng], {
          radius: 8,
          color: '#0f766e',
          weight: 2,
          fillColor: '#0f766e',
          fillOpacity: 0.85,
        })
          .addTo(map)
          .bindPopup(
            `<strong>${escapeHtml(provider.name)}</strong><br>` +
              `${escapeHtml(provider.country)}<br>` +
              `<a href="/clinics/${encodeURIComponent(provider.address)}">View clinic</a>`,
          );
      }

      if (located.length > 0) {
        map.fitBounds(bounds.pad(0.25), { maxZoom: 12 });
      }
    })().catch((err: unknown) => {
      if (!cancelled) setFailure(err ?? new Error('The map failed to load'));
    });

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
  }, [providers]);

  if (failure) throw failure;

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={`Map of ${providers.length} clinic${
        providers.length === 1 ? '' : 's'
      } with published locations`}
      className="relative z-0 h-80 w-full overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-canvas)]"
    />
  );
}
