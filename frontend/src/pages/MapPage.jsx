import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { api } from '../lib/api.js'

// 주민 3 지도. 필터: 전체 / 점검 필요 / 주민 제보 / 조치 완료. ('점검 필요'는 와이어프레임의 '점검 공백'·'점검 기록 없음'을 데이터에 맞게 바꾼 이름, docs/decisions.md) 하단 시트에 선택 항목 요약.
// 배경 타일은 CARTO (키 불필요, 출처 표기 필요). OSM 공용 타일은 쓰지 않음 (CLAUDE.md).
const CENTER = [37.5894, 127.0167]
const COLORS = { gap: '#6b7280', received: '#f59e0b', review: '#3b82f6', action: '#8b5cf6', done: '#16a34a' }
const FILTERS = [['all', '전체'], ['gap', '점검 필요'], ['resident', '주민 제보'], ['done', '조치 완료']]
const LEGEND = [['gap', '점검 필요 (규칙)'], ['received', '접수'], ['review', '검토·조치 중'], ['done', '조치 완료']]

export default function MapPage() {
  const el = useRef(null)
  const map = useRef(null)
  const layer = useRef(null)
  const [gaps, setGaps] = useState([])
  const [reports, setReports] = useState([])
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    map.current = L.map(el.current, { zoomControl: false }).setView(CENTER, 14)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    }).addTo(map.current)
    layer.current = L.layerGroup().addTo(map.current)
    api.gaps().then((g) => setGaps(g.features)).catch(() => {})
    api.reportsMap().then((r) => setReports(r.features)).catch(() => {})
    return () => map.current.remove()
  }, [])

  const shown = useMemo(() => {
    const gapPts = gaps.map((f) => ({ ...f, _kind: 'gap', _color: COLORS.gap }))
    const repPts = reports.map((f) => ({ ...f, _kind: 'resident', _color: COLORS[f.properties.status] ?? COLORS.received }))
    if (filter === 'gap') return gapPts
    if (filter === 'resident') return repPts
    if (filter === 'done') return repPts.filter((f) => f.properties.status === 'done')
    return [...gapPts, ...repPts]
  }, [gaps, reports, filter])

  useEffect(() => {
    layer.current.clearLayers()
    shown.forEach((f) => {
      const [lon, lat] = f.geometry.coordinates
      L.circleMarker([lat, lon], { radius: 6, color: f._color, fillColor: f._color, fillOpacity: 0.8, weight: 1 })
        .on('click', () => setSelected(f))
        .addTo(layer.current)
    })
  }, [shown])

  const p = selected?.properties
  return (
    <div className="relative h-full">
      <div ref={el} className="absolute inset-0" />
      <div className="absolute inset-x-2 top-2 z-[1000] flex gap-1">
        {FILTERS.map(([k, label]) => (
          <button key={k} type="button" onClick={() => setFilter(k)}
            className={`rounded-full px-3 py-1 text-sm shadow ${filter === k ? 'bg-brand text-white' : 'bg-white'}`}>{label}</button>
        ))}
      </div>
      <div className="absolute bottom-20 left-2 z-[1000] rounded bg-white/90 p-2 text-xs shadow">
        {LEGEND.map(([k, label]) => (
          <div key={k} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: COLORS[k] }} />{label}</div>
        ))}
      </div>
      {p && (
        <div className="absolute inset-x-0 bottom-16 z-[1000] rounded-t-xl bg-white p-4 shadow-lg">
          <button type="button" onClick={() => setSelected(null)} className="float-right text-gray-400">닫기</button>
          {selected._kind === 'gap'
            ? <><div className="text-xs text-gray-500">규칙</div><div className="font-semibold">{p.rule}</div><div className="text-sm">{p.reason}</div><div className="text-xs text-gray-500">{p.address}</div></>
            : <><div className="text-xs text-gray-500">주민 제보 · {p.status_label}</div><div className="font-semibold">{p.category ?? '분류 없음'}</div><div className="text-xs text-gray-500">{new Date(p.created_at).toLocaleString('ko-KR')}</div></>}
        </div>
      )}
    </div>
  )
}
