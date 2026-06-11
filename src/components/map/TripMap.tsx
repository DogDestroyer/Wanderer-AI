'use client'

import { useEffect, useMemo } from 'react'
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { TripPlan } from '@/lib/types'
import { formatTime, formatCurrency, formatDayLabel, getCategoryEmoji } from '@/lib/utils'

// ─── Palette — one colour per day ────────────────────────────────────────────
const DAY_COLORS = [
  '#4f46e5', // indigo
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#0ea5e9', // sky
  '#8b5cf6', // violet
  '#f97316', // orange
  '#06b6d4', // cyan
]

function getDayColor(dayIndex: number): string {
  return DAY_COLORS[dayIndex % DAY_COLORS.length]
}

// ─── Numbered circle icon (avoids the broken default-icon image URLs) ─────────
function createMarkerIcon(color: string, number: number) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:28px;height:28px;
      background:${color};
      border:2.5px solid white;
      border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      font-size:11px;font-weight:700;color:white;
      box-shadow:0 2px 8px rgba(0,0,0,0.30);
      font-family:system-ui,sans-serif;
    ">${number}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  })
}

// ─── Auto-fit bounds ─────────────────────────────────────────────────────────
// Lives inside MapContainer so it can call useMap()
function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap()
  const posKey = useMemo(
    () => positions.map((p) => `${p[0]},${p[1]}`).join('|'),
    [positions]
  )

  useEffect(() => {
    if (positions.length === 0) return
    if (positions.length === 1) {
      map.setView(positions[0], 14)
    } else {
      map.fitBounds(L.latLngBounds(positions), { padding: [40, 40], maxZoom: 15 })
    }
  }, [map, posKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

// ─── TripMap ─────────────────────────────────────────────────────────────────

interface TripMapProps {
  trip: TripPlan
}

export function TripMap({ trip }: TripMapProps) {
  const { days, destination } = trip

  // Initial map centre: use destination coords, or first valid activity
  const center = useMemo<[number, number]>(() => {
    if (destination.lat !== 0 || destination.lng !== 0) {
      return [destination.lat, destination.lng]
    }
    for (const day of days) {
      for (const act of day.activities) {
        if (act.location.lat !== 0 || act.location.lng !== 0) {
          return [act.location.lat, act.location.lng]
        }
      }
    }
    return [35.6762, 139.6503] // Tokyo default
  }, [destination, days])

  // All activity positions for FitBounds
  const allPositions = useMemo<[number, number][]>(() => {
    const out: [number, number][] = []
    for (const day of days) {
      for (const act of day.activities) {
        if (act.location.lat !== 0 || act.location.lng !== 0) {
          out.push([act.location.lat, act.location.lng])
        }
      }
    }
    return out
  }, [days])

  return (
    <div className="h-full w-full relative">
      <MapContainer
        center={center}
        zoom={12}
        className="h-full w-full"
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitBounds positions={allPositions} />

        {/* Route polylines — one dashed line per day */}
        {days.map((day, dayIdx) => {
          const positions: [number, number][] = day.activities
            .filter((a) => a.location.lat !== 0 || a.location.lng !== 0)
            .map((a) => [a.location.lat, a.location.lng])
          if (positions.length < 2) return null
          return (
            <Polyline
              key={`line-${day.id}`}
              positions={positions}
              pathOptions={{
                color: getDayColor(dayIdx),
                weight: 3,
                opacity: 0.65,
                dashArray: '7 5',
              }}
            />
          )
        })}

        {/* Activity markers */}
        {days.flatMap((day, dayIdx) =>
          day.activities
            .filter((a) => a.location.lat !== 0 || a.location.lng !== 0)
            .map((activity, actIdx) => (
              <Marker
                key={activity.id}
                position={[activity.location.lat, activity.location.lng]}
                icon={createMarkerIcon(getDayColor(dayIdx), actIdx + 1)}
              >
                <Popup maxWidth={220} className="wandr-popup">
                  <div style={{ fontFamily: 'system-ui, sans-serif', fontSize: '13px', lineHeight: '1.5' }}>
                    <div style={{ fontWeight: 600, color: '#111827', marginBottom: '2px' }}>
                      {getCategoryEmoji(activity.category)} {activity.title}
                    </div>
                    <div style={{ color: '#6b7280', fontSize: '12px' }}>
                      {formatTime(activity.startTime)} – {formatTime(activity.endTime)}
                      {activity.cost.amount > 0 && (
                        <span style={{ marginLeft: '6px' }}>
                          · {formatCurrency(activity.cost.amount, activity.cost.currency)}
                        </span>
                      )}
                    </div>
                    {activity.location.name && activity.location.name !== activity.title && (
                      <div style={{ color: '#9ca3af', fontSize: '11px', marginTop: '2px' }}>
                        📍 {activity.location.name}
                      </div>
                    )}
                    {activity.description && (
                      <div style={{ color: '#374151', fontSize: '12px', marginTop: '4px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {activity.description}
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))
        )}
      </MapContainer>

      {/* ── Day legend (overlaid on map) ──────────────────────────────────────── */}
      {days.length > 0 && (
        <div
          className="absolute bottom-8 right-3 z-[1000] bg-white/95 backdrop-blur-sm rounded-xl shadow-md border border-gray-100 p-3"
          style={{ minWidth: 130, maxWidth: 160 }}
        >
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Days
          </p>
          {days.map((day, i) => (
            <div key={day.id} className="flex items-center gap-2 mb-1.5 last:mb-0">
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ background: getDayColor(i) }}
              />
              <span className="text-[11px] text-gray-600 font-medium truncate">
                {formatDayLabel(day.date, i)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Empty state when no coordinates ──────────────────────────────────── */}
      {allPositions.length === 0 && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-white/60 backdrop-blur-sm">
          <div className="text-center px-6 py-8 bg-white rounded-2xl shadow-sm border border-gray-100 mx-4">
            <p className="text-2xl mb-2">🗺️</p>
            <p className="text-sm font-medium text-gray-700">No locations yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Ask the AI to plan your trip and activities will appear here.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
