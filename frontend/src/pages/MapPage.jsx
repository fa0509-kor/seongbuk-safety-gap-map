import ResidentHeader, { residentAsset } from '../components/ResidentHeader.jsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { api } from '../lib/api.js'
import { addBaseLayer } from '../lib/map.js'
import PhotoViewer from '../components/PhotoViewer.jsx'
import { myReports } from '../lib/myReports.js'

// 주민 3 지도. 필터: 전체 / 주민 제보 / 조치 완료. 소방용수 '점검 필요' 점은 주민이 신경 쓰는 정보가 아니라(멘토 지적) 이 화면에서 뺐고 관리자 목록에만 남김 (docs/decisions.md). 하단 시트에 선택 항목 요약.
// 배경 타일 설정은 lib/map.js (OSM 표준 타일, 출처 표기 필수)
const CENTER = [37.5894, 127.0167]
const COLORS = { received: '#001a47', review: '#a7430d', action: '#a7430d', done: '#166548' }
const FILTERS = [['all', '전체'], ['resident', '주민 제보'], ['done', '조치 완료']]
const LEGEND = [['received', '접수'], ['review', '검토·조치 중'], ['done', '조치 완료']]
// 멀리서 보면 가까운 제보를 숫자 원으로 묶고, 확대하면 낱개로 풀린다 (부동산 앱 지도처럼). 의존 라이브러리 없이 화면 격자로 묶는다.
const CLUSTER_PX = 44      // 화면에서 이 거리(픽셀) 안에 있는 점끼리 한 묶음 (거리 기준이라 격자 경계에 걸려 갈라지지 않음)
const MAX_CLUSTER_ZOOM = 17 // 이 줌 이상에서는 묶지 않고 낱개로 보여 줌

function groupPoints(points, map, zoom) {
  if (zoom >= MAX_CLUSTER_ZOOM) return points.map((f) => [f])
  // 1) 위치 순으로 훑으며 가장 가까운 묶음(중심 기준)에 넣거나 새 묶음을 만든다. 순서를 고정해 같은 줌에서 늘 같은 결과가 나오게 함
  const sorted = [...points].sort((a, b) => a.geometry.coordinates[0] - b.geometry.coordinates[0] || a.geometry.coordinates[1] - b.geometry.coordinates[1])
  const groups = []
  sorted.forEach((f) => {
    const [lon, lat] = f.geometry.coordinates
    const pt = map.project([lat, lon], zoom)
    let best = null
    let bd = CLUSTER_PX
    groups.forEach((g) => {
      const d = Math.hypot(g.x - pt.x, g.y - pt.y)
      if (d < bd) { bd = d; best = g }
    })
    if (best) {
      best.items.push(f)
      best.x += (pt.x - best.x) / best.items.length
      best.y += (pt.y - best.y) / best.items.length
    } else groups.push({ x: pt.x, y: pt.y, items: [f] })
  })
  // 2) 중심끼리 아직 가까운 묶음은 하나로 합친다 (더 합칠 게 없을 때까지)
  let merged = true
  while (merged) {
    merged = false
    for (let i = 0; i < groups.length && !merged; i += 1) {
      for (let j = i + 1; j < groups.length; j += 1) {
        if (Math.hypot(groups[i].x - groups[j].x, groups[i].y - groups[j].y) < CLUSTER_PX) {
          const [a, b] = [groups[i], groups[j]]
          const n = a.items.length + b.items.length
          a.x = (a.x * a.items.length + b.x * b.items.length) / n
          a.y = (a.y * a.items.length + b.y * b.items.length) / n
          a.items.push(...b.items)
          groups.splice(j, 1)
          merged = true
          break
        }
      }
    }
  }
  return groups.map((g) => g.items)
}

export default function MapPage() {
  const el = useRef(null)
  const map = useRef(null)
  const layer = useRef(null)
  const [reports, setReports] = useState([])
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [confirmMsg, setConfirmMsg] = useState('')
  const [shots, setShots] = useState({ before: null, after: null }) // 선택한 제보의 조치 전·후 사진 (눌렀을 때 불러옴)
  const [viewer, setViewer] = useState(false)
  const [view, setView] = useState({ zoom: 14, bounds: null }) // 확대·이동할 때마다 갱신 → 묶음과 '이 지역 N건'을 다시 계산

  // 나도 봤어요(+1): 같은 곳 확인 인원 → 우선순위 점수에 반영. 브라우저당 한 번
  async function confirmSeen(publicId) {
    try {
      const r = await api.confirm(publicId)
      myReports.markConfirmed(publicId)
      setReports((list) => list.map((f) => (f.properties.public_id === publicId
        ? { ...f, properties: { ...f.properties, confirm_count: r.confirm_count, cross_checked: r.cross_checked } } : f)))
      setSelected((f) => f?.properties.public_id === publicId ? { ...f, properties: { ...f.properties, confirm_count: r.confirm_count, cross_checked: r.cross_checked } } : f)
      setConfirmMsg('확인 고마워요. 담당자 화면의 우선순위에 반영됩니다.')
    } catch (e) { setConfirmMsg(`실패: ${e.message}`) }
  }

  useEffect(() => {
    map.current = L.map(el.current, { zoomControl: false }).setView(CENTER, 14)
    addBaseLayer(map.current)
    L.control.zoom({ position: 'bottomright' }).addTo(map.current)
    // 어린이보호구역 경계: 얇은 회색 선. 제보·공백 점보다 아래에 깔고, 눌러도 반응하지 않음
    map.current.createPane('zones').style.zIndex = 350
    api.zones().then((z) => {
      const poly = z.features.filter((f) => f.geometry.type === 'MultiPolygon' && f.properties.kind === '어린이')
      L.geoJSON({ type: 'FeatureCollection', features: poly }, {
        pane: 'zones', interactive: false, style: { color: '#dc2626', weight: 1.5, opacity: 0.8, fillColor: '#f87171', fillOpacity: 0.2 }, // 어린이보호구역 도로 포장색(빨강). 회색 '점검 필요'·주황 '접수' 점과 구분
      }).addTo(map.current)
    }).catch(() => {})
    layer.current = L.layerGroup().addTo(map.current)
    const syncView = () => setView({ zoom: map.current.getZoom(), bounds: map.current.getBounds() })
    map.current.on('zoomend moveend', syncView)
    syncView()
    api.reportsMap().then((r) => setReports(r.features)).catch(() => {})
    return () => map.current.remove()
  }, [])

  const shown = useMemo(() => {
    const repPts = reports.map((f) => ({ ...f, _color: COLORS[f.properties.status] ?? COLORS.received }))
    const term = query.trim().toLowerCase()
    return repPts.filter(({ properties: p }) => {
      if (filter === 'done' && p.status !== 'done') return false
      if (filter === 'resident' && p.status === 'done') return false
      return !term || [p.category, p.facility_label, p.address].some((value) => value?.toLowerCase().includes(term))
    })
  }, [reports, filter, query])

  useEffect(() => {
    layer.current.clearLayers()
    groupPoints(shown, map.current, view.zoom).forEach((items) => {
      if (items.length === 1) {
        const f = items[0]
        const [lon, lat] = f.geometry.coordinates
        // 조치 완료 뒤 '아직 그대로'라는 주민 의견이 더 많은 곳은 빨간 테두리로 표시
        const recheck = f.properties.recheck
        const icon = L.divIcon({
          className: 'resident-map-pin', iconSize: [32, 32],
          html: `<span style="background:${f._color};border-color:${recheck ? '#dc2626' : '#fff'}"><img src="${residentAsset('home-imgPin.svg')}" alt=""></span>`,
        })
        L.marker([lat, lon], { icon, alt: f.properties.category ?? '주민 제보' })
          .on('click', () => { setSelected(f); setConfirmMsg('') })
          .addTo(layer.current)
        return
      }
      const lls = items.map((f) => [f.geometry.coordinates[1], f.geometry.coordinates[0]])
      const center = lls.reduce((a, c) => [a[0] + c[0] / lls.length, a[1] + c[1] / lls.length], [0, 0])
      const size = Math.min(60, 34 + items.length * 2)
      const icon = L.divIcon({
        className: 'resident-cluster', iconSize: [size, size], html: String(items.length),
      })
      L.marker(center, { icon, alt: `제보 ${items.length}건 묶음` })
        .on('click', () => { setSelected(null); map.current.fitBounds(L.latLngBounds(lls), { padding: [70, 70], maxZoom: MAX_CLUSTER_ZOOM }) })
        .addTo(layer.current)
    })
  }, [shown, view.zoom])

  // 지금 지도에 보이는 영역 안의 제보 수
  const inView = useMemo(() => (view.bounds
    ? shown.filter((f) => view.bounds.contains([f.geometry.coordinates[1], f.geometry.coordinates[0]])).length : shown.length), [shown, view.bounds])

  const p = selected?.properties
  // 마커를 누르면 그 제보의 사진 주소를 불러온다 (지도 응답에는 사진을 싣지 않아 가볍게 유지)
  useEffect(() => {
    setShots({ before: null, after: null }); setViewer(false)
    if (!p?.public_id || p.status !== 'done') return undefined // 지도에는 조치 완료된 제보의 사진만 보여 준다 (조치 전 제보 사진은 공개하지 않음)
    let alive = true
    api.myReports([p.public_id]).then((list) => { if (alive && list[0]) setShots({ before: list[0].photo_url ?? null, after: list[0].after_photo_url ?? null }) }).catch(() => {})
    return () => { alive = false }
  }, [p?.public_id]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="resident-screen">
      <ResidentHeader caption="성북구 주민 제보" title="동네 지도" />
      <input type="search" aria-label="제보 검색" placeholder="제보 유형 · 시설 검색" value={query}
        onChange={(e) => { setQuery(e.target.value); setSelected(null) }}
        className="rounded-xl border border-[#ebefcb] bg-white p-2.5 text-sm" />
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={filter === k} onClick={() => { setFilter(k); setSelected(null) }}
            className={`resident-chip ${filter === k ? 'bg-ink text-white' : 'border border-line bg-white text-ink'}`}>{label}</button>
        ))}
      </div>
      <div className="flex flex-wrap justify-between gap-2 rounded-xl border border-line bg-white px-3 py-2 text-[11px] font-bold">
        {LEGEND.map(([k, label]) => (
          <div key={k} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: COLORS[k] }} />{label}</div>
        ))}
        <div className="flex items-center gap-1"><span className="h-2 w-2 rounded-full border-2 border-red-600" style={{ background: COLORS.done }} />조치 후 재확인 필요</div>
        <div className="flex items-center gap-1"><span className="h-2 w-3 border border-red-600 bg-red-300" />어린이보호구역</div>
      </div>
      <div className="relative">
        <div ref={el} className="h-[min(47dvh,440px)] min-h-60 overflow-hidden rounded-[16px]" aria-label="성북구 주민 제보 지도" />
        <span className="resident-chip pointer-events-none absolute left-3 top-3 z-[500] bg-white">
          {view.zoom < MAX_CLUSTER_ZOOM ? '축소 · 제보 묶음' : '확대 · 개별 위치'}
        </span>
      </div>
      {!p && <article className="resident-card">
        <h2 className="text-sm font-bold">이 지역 제보 {inView}건</h2>
        <p className="mt-1 text-xs text-sub">묶음을 누르거나 지도를 확대하면 개별 제보 위치를 볼 수 있어요.</p>
      </article>}
      {viewer && <PhotoViewer before={shots.before} after={shots.after} onClose={() => setViewer(false)} />}
      {p && (
        <div className="resident-card flex flex-col gap-2.5">
          <button type="button" onClick={() => setSelected(null)} className="self-end text-xs text-sub">닫기</button>
          <div className="flex items-start gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-2.5">
              <div className="text-[13px] text-gray-500">주민 제보 · {p.status_label}{p.facility_label && ` · ${p.facility_label}`}</div>
              <div className="font-semibold">{p.category ?? '분류 없음'}</div>
              <div className="text-[13px] text-gray-500">{new Date(p.created_at).toLocaleString('ko-KR')} · 같은 곳 확인 {p.confirm_count ?? 0}명{p.cross_checked && ' · 교차확인'}</div>
            </div>
            {(shots.before || shots.after) && (
              <div className="flex shrink-0 gap-1.5">
                {[[shots.before, shots.after ? '조치 전' : '제보 사진'], [shots.after, '조치 후']].filter(([src]) => src).map(([src, label]) => (
                  <button key={label} type="button" onClick={() => setViewer(true)} aria-label={`${label} 사진 크게 보기`}
                    className="relative h-16 w-16 overflow-hidden rounded-lg border border-line">
                    <img src={src} alt={label} className="h-full w-full object-cover" />
                    <span className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-center text-[11px] font-semibold text-white">{label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {p.recheck && <p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] leading-snug">조치 완료 뒤에도 '아직 그대로'라는 주민 의견이 더 많은 곳이에요. 담당자가 다시 확인합니다.</p>}
          {p.status !== 'done' && (
            <button type="button" disabled={myReports.confirmed(p.public_id) || myReports.ids().includes(p.public_id)}
              onClick={() => confirmSeen(p.public_id)}
              className="resident-chip self-start bg-[#ebefcb] disabled:opacity-40">
              {myReports.confirmed(p.public_id) ? '확인했어요' : '나도 봤어요 (+1)'}
            </button>
          )}
          {confirmMsg && <p className="mt-1 text-[13px] text-gray-600">{confirmMsg}</p>}
        </div>
      )}
    </section>
  )
}
