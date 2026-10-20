import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { addBaseLayer } from '../lib/map.js'

// 제보 위치 핀 조정: 핀을 끌거나 지도를 눌러 위치를 바꾼다. value가 없으면 성북구청 근처에서 시작.
const SEONGBUK = [37.5894, 127.0167]
const pinIcon = L.divIcon({
  className: '',
  html: '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#1d4ed8;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 22],
})

export default function PinPicker({ value, onChange }) {
  const el = useRef(null)
  const map = useRef(null)
  const marker = useRef(null)

  useEffect(() => {
    const start = value ? [value.lat, value.lon] : SEONGBUK
    map.current = L.map(el.current, { zoomControl: false, attributionControl: true }).setView(start, 17)
    addBaseLayer(map.current)
    marker.current = L.marker(start, { draggable: true, icon: pinIcon }).addTo(map.current)
    const emit = (ll) => onChange({ lat: ll.lat, lon: ll.lng })
    marker.current.on('dragend', () => emit(marker.current.getLatLng()))
    map.current.on('click', (e) => { marker.current.setLatLng(e.latlng); emit(e.latlng) })
    return () => map.current.remove()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 현재 위치가 늦게 들어오면 핀과 지도를 옮긴다
  useEffect(() => {
    if (!value || !marker.current) return
    const cur = marker.current.getLatLng()
    if (Math.abs(cur.lat - value.lat) > 1e-7 || Math.abs(cur.lng - value.lon) > 1e-7) {
      marker.current.setLatLng([value.lat, value.lon])
      map.current.setView([value.lat, value.lon], 17)
    }
  }, [value])

  return <div ref={el} className="h-48 w-full overflow-hidden rounded-lg border" aria-label="제보 위치 지도. 핀을 끌어 위치 조정" />
}
