import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { api } from '../../lib/api.js'
import { addBaseLayer } from '../../lib/map.js'
import PriorityCard from '../../components/PriorityCard.jsx'

const STATES = [['점검 필요 (규칙)', '#001a47'], ['접수', '#8895aa'], ['검토 · 조치 중', '#a7430d'], ['조치 완료', '#166548']]
const colorFor = (row) => STATES[row.status === 'done' ? 3 : row.status !== 'received' ? 2 : row.source === 'gap' ? 0 : 1][1]

export default function AdminMap() {
  const container = useRef(null)
  const [selected, setSelected] = useState(null)
  const [message, setMessage] = useState('점검 대상을 불러오는 중…')

  useEffect(() => {
    let active = true
    const map = L.map(container.current).setView([37.5894, 127.0167], 14)
    addBaseLayer(map)
    api.adminReports().then((rows) => {
      if (!active) return
      const located = rows.filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lon))
      for (const row of located) {
        const color = colorFor(row)
        L.circleMarker([row.lat, row.lon], { color, radius: 7, fillOpacity: 0.8 })
          .on('click', () => setSelected(row)).addTo(map)
      }
      setMessage(located.length ? '지도에서 점검 대상을 선택하세요.' : '지도에 표시할 위치가 없어요.')
    }).catch(() => { if (active) setMessage('점검 대상을 불러오지 못했어요.') })
    return () => { active = false; map.remove() }
  }, [])

  return <section className="admin-page">
    <div className="admin-page-heading"><h1>점검 지도</h1><p>규칙이 선별한 점검 후보와 처리 상태를 확인하세요.</p></div>
    <div className="admin-map-grid">
      <div>
        <div ref={container} className="admin-map-canvas" aria-label="점검 대상 지도" />
        <div className="admin-panel mt-3 flex flex-wrap gap-3 text-xs" aria-label="지도 범례">
          {STATES.map(([label, color]) => <span key={label} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: color }} />{label}
          </span>)}
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
