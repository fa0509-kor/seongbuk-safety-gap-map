import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { api } from '../../lib/api.js'
import { addBaseLayer } from '../../lib/map.js'
import PriorityCard from '../../components/PriorityCard.jsx'
import { addCluster, groupPoints, MAX_CLUSTER_ZOOM } from '../../lib/cluster.js'

const STATES = [['점검 필요 (규칙)', '#001a47'], ['접수', '#8895aa'], ['검토 · 조치 중', '#a7430d'], ['조치 완료', '#166548']]
const toLatLng = (row) => [row.lat, row.lon]
const colorFor = (row) => STATES[row.status === 'done' ? 3 : row.status !== 'received' ? 2 : row.source === 'gap' ? 0 : 1][1]

export default function AdminMap() {
  const container = useRef(null)
  const map = useRef(null)
  const layer = useRef(null)
  const [located, setLocated] = useState([])
  const [zoom, setZoom] = useState(14) // 확대·축소할 때마다 묶음을 다시 계산
  const [selected, setSelected] = useState(null)
  const [message, setMessage] = useState('점검 대상을 불러오는 중…')

  useEffect(() => {
    let active = true
    map.current = L.map(container.current, { zoomSnap: 0.25 }).setView([37.5894, 127.0167], 14)
    addBaseLayer(map.current)
    layer.current = L.layerGroup().addTo(map.current)
    map.current.on('zoomend', () => setZoom(map.current.getZoom()))
    api.adminReports().then((rows) => {
      if (!active) return
      const pts = rows.filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lon))
      setLocated(pts)
      if (pts.length) { map.current.invalidateSize(); map.current.fitBounds(pts.map(toLatLng), { padding: [30, 30], maxZoom: 16 }) } // 대상 전체가 보이게
      setMessage(pts.length ? '지도에서 점검 대상을 선택하세요.' : '지도에 표시할 위치가 없어요.')
    }).catch(() => { if (active) setMessage('점검 대상을 불러오지 못했어요.') })
    return () => { active = false; map.current.remove(); map.current = null }
  }, [])

  // 멀리서 보면 가까운 대상을 숫자 원으로 묶고, 확대하면 상태 색 점 (주민 지도와 같은 방식)
  useEffect(() => {
    if (!layer.current) return
    layer.current.clearLayers()
    groupPoints(located, map.current, map.current.getZoom(), toLatLng).forEach((items) => {
      if (items.length > 1) { addCluster(L, layer.current, map.current, items.map(toLatLng), () => setSelected(null)); return }
      const row = items[0]
      L.circleMarker(toLatLng(row), { color: colorFor(row), radius: 7, fillOpacity: 0.8 })
        .on('click', () => setSelected(row)).addTo(layer.current)
    })
  }, [located, zoom])

  return <section className="admin-page">
    <div className="admin-page-heading"><h1>점검 지도</h1><p>규칙이 선별한 점검 후보와 처리 상태를 확인하세요.</p></div>
    <div className="admin-map-grid">
      <div>
        <div className="relative">
          <div ref={container} className="admin-map-canvas" aria-label="점검 대상 지도" />
          <span className="resident-chip pointer-events-none absolute left-14 top-3 z-[500] bg-white text-xs">
            {zoom < MAX_CLUSTER_ZOOM ? '축소 · 대상 묶음' : '확대 · 개별 위치'}
          </span>
        </div>
        <div className="admin-panel mt-3 flex flex-wrap gap-3 text-xs" aria-label="지도 범례">
          {STATES.map(([label, color]) => <span key={label} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: color }} />{label}
          </span>)}
          <span className="flex items-center gap-1.5"><span className="grid size-4 place-items-center rounded-full bg-brand text-[9px] font-bold text-white">n</span>여러 곳 묶음 (누르면 확대)</span>
        </div>
      </div>
      <div className="grid content-start gap-4">
        {selected ? <>
          <article className="admin-panel">
            <h2 className="font-bold">{selected.gap_rule ?? selected.ai?.category ?? '점검 대상'}</h2>
            <p className="mt-2 text-sm text-sub">#{selected.id} · {selected.address || '주소 없음'} · {selected.source_label}</p>
            <p className="mt-2 text-sm font-semibold">{selected.status_label}</p>
          </article>
          <PriorityCard priority={selected.priority} />
          <Link className="admin-action" to={`/admin/reports/${selected.id}`}>점수 근거 · 상세 보기 →</Link>
        </> : <p className="admin-panel text-sm text-sub" role="status">{message}</p>}
      </div>
    </div>
    <Link to="/admin/reports" className="text-sm font-semibold underline">목록으로 돌아가기</Link>
  </section>
}
