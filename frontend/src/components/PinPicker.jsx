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

// readOnly: 작은 미리보기(움직이지 않음). viewOnly: 크게 볼 때(핀은 그대로, 지도만 끌고 확대·축소 가능)
export default function PinPicker({ value, onChange, readOnly = false, viewOnly = false }) {
  const fixed = readOnly || viewOnly // 핀 위치를 바꿀 수 없는 모드
  const el = useRef(null)
  const map = useRef(null)
  const marker = useRef(null)

  useEffect(() => {
    const start = value ? [value.lat, value.lon] : SEONGBUK
    map.current = L.map(el.current, { zoomControl: viewOnly, attributionControl: true, dragging: !readOnly, scrollWheelZoom: !readOnly, doubleClickZoom: !readOnly, touchZoom: !readOnly, keyboard: !readOnly }).setView(start, 17)
    addBaseLayer(map.current)
    marker.current = L.marker(start, { draggable: !fixed, icon: pinIcon }).addTo(map.current)
    const emit = (ll) => onChange({ lat: ll.lat, lon: ll.lng })
    if (!fixed) {
      marker.current.on('dragend', () => emit(marker.current.getLatLng()))
      map.current.on('click', (e) => { marker.current.setLatLng(e.latlng); emit(e.latlng) })
    }
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

  return <div ref={el} className={`${viewOnly ? 'h-full' : readOnly ? 'h-[76px]' : 'h-48'} w-full overflow-hidden rounded-lg border`} aria-label={viewOnly ? '제보 위치 큰 지도' : readOnly ? '지정한 제보 위치' : '제보 위치 지도. 핀을 끌어 위치 조정'} />
}
