import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { api } from '../lib/api.js'
import { addBaseLayer } from '../lib/map.js'
import { myReports } from '../lib/myReports.js'

// 주민 3 지도. 필터: 전체 / 점검 필요 / 주민 제보 / 조치 완료. ('점검 필요'는 와이어프레임의 '점검 공백'·'점검 기록 없음'을 데이터에 맞게 바꾼 이름, docs/decisions.md) 하단 시트에 선택 항목 요약.
// 배경 타일 설정은 lib/map.js (OSM 표준 타일, 출처 표기 필수)
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
  const [confirmMsg, setConfirmMsg] = useState('')

  // 나도 봤어요(+1): 같은 곳 확인 인원 → 우선순위 점수에 반영. 브라우저당 한 번
  async function confirmSeen(publicId) {
    try {
      const r = await api.confirm(publicId)
      myReports.markConfirmed(publicId)
      setReports((list) => list.map((f) => (f.properties.public_id === publicId
        ? { ...f, properties: { ...f.properties, confirm_count: r.confirm_count } } : f)))
      setSelected((f) => ({ ...f, properties: { ...f.properties, confirm_count: r.confirm_count } }))
      setConfirmMsg('확인 고마워요. 담당자 화면의 우선순위에 반영됩니다.')
    } catch (e) { setConfirmMsg(`실패: ${e.message}`) }
  }

  useEffect(() => {
    map.current = L.map(el.current, { zoomControl: false }).setView(CENTER, 14)
    addBaseLayer(map.current)
    // 어린이보호구역 경계: 얇은 회색 선. 제보·공백 점보다 아래에 깔고, 눌러도 반응하지 않음
    map.current.createPane('zones').style.zIndex = 350
    api.zones().then((z) => {
      const poly = z.features.filter((f) => f.geometry.type === 'MultiPolygon' && f.properties.kind === '어린이')
      L.geoJSON({ type: 'FeatureCollection', features: poly }, {
        pane: 'zones', interactive: false, style: { color: '#dc2626', weight: 1.5, opacity: 0.8, fillColor: '#f87171', fillOpacity: 0.2 }, // 어린이보호구역 도로 포장색(빨강). 회색 '점검 필요'·주황 '접수' 점과 구분
      }).addTo(map.current)
    }).catch(() => {})
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
        .on('click', () => { setSelected(f); setConfirmMsg('') })
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
        <div className="flex items-center gap-1"><span className="h-2 w-3 border border-red-600 bg-red-300" />어린이보호구역</div>
      </div>
      {p && (
        <div className="absolute inset-x-0 bottom-16 z-[1000] rounded-t-xl bg-white p-4 shadow-lg">
          <button type="button" onClick={() => setSelected(null)} className="float-right text-gray-400">닫기</button>
          {selected._kind === 'gap'
            ? <><div className="text-xs text-gray-500">규칙</div><div className="font-semibold">{p.rule}</div><div className="text-sm">{p.reason}</div><div className="text-xs text-gray-500">{p.address}</div></>
            : <>
                <div className="text-xs text-gray-500">주민 제보 · {p.status_label}{p.facility_label && ` · ${p.facility_label}`}</div>
                <div className="font-semibold">{p.category ?? '분류 없음'}</div>
                <div className="text-xs text-gray-500">{new Date(p.created_at).toLocaleString('ko-KR')} · 같은 곳 확인 {p.confirm_count ?? 0}명</div>
                {p.status !== 'done' && (
                  <button type="button" disabled={myReports.confirmed(p.public_id) || myReports.ids().includes(p.public_id)}
                    onClick={() => confirmSeen(p.public_id)}
                    className="mt-2 w-full rounded-lg border py-2 text-sm disabled:opacity-40">
                    {myReports.confirmed(p.public_id) ? '확인했어요' : '나도 봤어요 (+1)'}
                  </button>
                )}
                {confirmMsg && <p className="mt-1 text-xs text-gray-600">{confirmMsg}</p>}
              </>}
        </div>
      )}
    </div>
  )
}
