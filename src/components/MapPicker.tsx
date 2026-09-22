"use client";

// Leaflet.js + OpenStreetMap map picker — no API key required.
// If a Google Maps API key is later provided, swap this component's
// internals for the Google Maps JS API (keep the same props contract:
// value/onChange of {lat, lng}) so callers don't need to change.

import { useEffect, useRef, useState } from "react";
import { CHENNAI_CENTER } from "@/lib/constants";

export interface LatLng {
  lat: number;
  lng: number;
}

interface MapPickerProps {
  value: LatLng | null;
  onChange: (value: LatLng) => void;
}

export default function MapPicker({ value, onChange }: MapPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const L = (await import("leaflet")).default;

      // Fix default marker icon paths (Leaflet's default assets don't
      // resolve correctly under bundlers like webpack/Next.js).
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png"
      });

      if (cancelled || !mapContainerRef.current || mapRef.current) return;

      const start = value || CHENNAI_CENTER;
      const map = L.map(mapContainerRef.current).setView([start.lat, start.lng], 14);
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
      }).addTo(map);

      const marker = L.marker([start.lat, start.lng], { draggable: true }).addTo(map);
      markerRef.current = marker;

      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        onChange({ lat: pos.lat, lng: pos.lng });
      });

      map.on("click", (e: any) => {
        marker.setLatLng(e.latlng);
        onChange({ lat: e.latlng.lat, lng: e.latlng.lng });
      });

      if (!value) {
        onChange(start);
      }
    }

    init();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function useMyLocation() {
    if (!navigator.geolocation) {
      setGeoError("Geolocation is not supported by your browser.");
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        onChange(next);
        if (mapRef.current && markerRef.current) {
          mapRef.current.setView([next.lat, next.lng], 16);
          markerRef.current.setLatLng([next.lat, next.lng]);
        }
        setLocating(false);
      },
      () => {
        setGeoError("Could not get your current location. Please drag the pin instead.");
        setLocating(false);
      }
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm text-gray-600">
          Drag the pin or click on the map to mark the complaint location.
        </p>
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="rounded-md border border-navy-600 px-3 py-1.5 text-xs font-semibold text-navy hover:bg-navy-50 disabled:opacity-60"
        >
          {locating ? "Locating..." : "Use my current location"}
        </button>
      </div>
      <div ref={mapContainerRef} style={{ height: "320px" }} className="overflow-hidden rounded-lg border border-gray-300" />
      {geoError && <p className="form-error">{geoError}</p>}
      {value && (
        <p className="mt-2 text-sm text-gray-700">
          Coordinates: <span className="font-mono">{value.lat.toFixed(6)}, {value.lng.toFixed(6)}</span>
        </p>
      )}
    </div>
  );
}
