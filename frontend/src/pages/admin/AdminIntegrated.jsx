import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { api } from '../../lib/api.js'
import { addBaseLayer } from '../../lib/map.js'
import { addCluster, groupPoints, MAX_CLUSTER_ZOOM } from '../../lib/cluster.js'

// 통합 점검 후보: 같은 주소에 서로 다른 안전시설이 2종 이상 있는 곳.
// '공백'이 아니라 여러 부서(소방·보건·복지·교통)가 따로 점검하는 곳을 묶어 점검할 후보 (docs/decisions.md 10/19)
const KINDS = ['소방용수', 'AED', '무더위쉼터', '어린이보호구역']
const toLatLng = (f) => [f.geometry.coordinates[1], f.geometry.coordinates[0]]

export default function AdminIntegrated() {
  const el = useRef(null)
  const map = useRef(null)
  const layer = useRef(null)
  const points = useRef([]) // 지금 보이는 후보 좌표 (지도 크기가 바뀌면 다시 맞추는 데 씀)
  const picked = useRef(null)
  const fitted = useRef('') // 마지막으로 지도 범위를 맞춘 필터. 같은 필터에서는 다시 맞추지 않는다 (주소를 눌러 확대한 상태 유지)
  const [rows, setRows] = useState([])
  const [address, setAddress] = useState('')
  const [selected, setSelected] = useState(null)
  const [need, setNeed] = useState(2)
  const [kind, setKind] = useState('')
  const [zoom, setZoom] = useState(13) // 확대·축소할 때마다 묶음을 다시 계산
  const [checked, setChecked] = useState(() => new Set()) // 선택한 후보에서 확인을 마친 시설 (화면 표시용, 저장하지 않음)
  const [planMsg, setPlanMsg] = useState('')

  useEffect(() => {
    map.current = L.map(el.current, { zoomSnap: 0.25 }).setView([37.5894, 127.0167], 13) // 0.25 단위로 확대해 후보가 지도에 꽉 차게
    addBaseLayer(map.current)
    layer.current = L.layerGroup().addTo(map.current)
    map.current.on('zoomend', () => setZoom(map.current.getZoom()))
    api.adminIntegrated().then((g) => setRows(g.features)).catch(() => {})
    // 글꼴·이미지가 늦게 불러와지거나 창 크기가 바뀌면 지도 칸 크기가 달라진다.
    // 그때마다 크기를 다시 재고, 후보를 고르기 전이면 전체 후보에 다시 맞춘다
    const ro = new ResizeObserver(() => {
      if (!map.current) return
      map.current.invalidateSize()
      if (!picked.current && points.current.length) map.current.fitBounds(points.current, { padding: [16, 16], maxZoom: 16 })
    })
    ro.observe(el.current)
    return () => { ro.disconnect(); map.current.remove(); map.current = null }
  }, [])

  // 고른 후보는 지도 크기 감시보다 먼저 기록해 둔다 (고른 뒤에 전체 범위로 되돌아가지 않게)
  useLayoutEffect(() => { picked.current = selected; setChecked(new Set()); setPlanMsg('') }, [selected])

  // 후보를 고르면 (목록·지도 어느 쪽이든) 그 위치로 확대. 위쪽 설명 길이가 바뀌어 지도 크기도 다시 잰다
  useEffect(() => {
    if (!selected) return
    const [lon, lat] = selected.geometry.coordinates
    map.current.invalidateSize()
    map.current.setView([lat, lon], 17)
  }, [selected])

  const shown = useMemo(() => rows
    .filter((f) => f.properties.address.includes(address.trim()))
    .filter((f) => f.properties.kinds.length >= need && (!kind || f.properties.kinds.includes(kind)))
    .sort((a, b) => b.properties.kinds.length - a.properties.kinds.length), [rows, need, kind, address])

  useEffect(() => {
    layer.current.clearLayers()
    const pts = []
    shown.forEach((f) => pts.push(toLatLng(f)))
    // 멀리서 보면 가까운 후보를 숫자 원으로 묶고, 확대하면 낱개 점 (주민 지도와 같은 방식)
    groupPoints(shown, map.current, map.current.getZoom(), toLatLng).forEach((items) => {
      if (items.length > 1) { addCluster(L, layer.current, map.current, items.map(toLatLng), () => setSelected(null)); return }
      const f = items[0]
      const n = f.properties.kinds.length
      L.circleMarker(toLatLng(f), { radius: 4 + n * 2, color: '#001A47', fillOpacity: 0.7, weight: 2 })
        .on('click', () => setSelected(f)).addTo(layer.current)
    })
    // 필터가 바뀌면 보이는 후보가 모두 지도 안에 들어오게 범위를 맞춘다
    const key = `${address.trim()}|${need}|${kind}|${rows.length}`
    points.current = pts
    if (pts.length && fitted.current !== key) {
      fitted.current = key
      picked.current = null
      map.current.invalidateSize()
      map.current.fitBounds(pts, { padding: [16, 16], maxZoom: 16 })
    }
  }, [shown, zoom]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="admin-page">
      <div className="admin-page-heading">
        <h1>통합 점검 후보</h1>
        <p className="text-sm text-gray-600">같은 주소에 서로 다른 안전시설이 함께 있는 곳. 부서별로 따로 점검하는 대신 한 번에 묶어 점검할 후보입니다. 같은 주소가 같은 출입문이라는 뜻은 아니므로 현장 확인이 필요합니다.</p>
      </div>
      <div className="admin-callout flex flex-wrap items-center gap-4"><strong className="text-2xl">{shown.length}곳</strong><span className="rounded bg-accent px-3 py-1 text-xs font-bold text-brand">{need}종 이상</span><span className="text-sm">한 번의 방문으로, 여러 시설을 함께 점검하세요.</span></div>
      <div className="admin-panel flex flex-wrap gap-2 text-sm">
        <input type="search" aria-label="주소 검색" placeholder="도로명 또는 건물 주소 검색" value={address} onChange={(e) => { setAddress(e.target.value); setSelected(null) }} />
        <select value={need} onChange={(e) => setNeed(Number(e.target.value))} className="rounded border bg-white p-1">
          <option value={2}>2종 이상</option><option value={3}>3종 이상</option><option value={4}>4종 모두</option>
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded border bg-white p-1">
          <option value="">전체 시설</option>{KINDS.map((k) => <option key={k} value={k}>{k} 포함</option>)}
        </select>
      </div>
      <div className="integrated-grid grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4">
        <div className="h-[480px] overflow-y-auto rounded-lg bg-white">
          <h2 className="px-4 py-3 font-bold">후보 주소 <span className="text-sm text-sub">{shown.length}곳</span></h2>
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white text-left text-gray-500"><tr><th className="p-2">주소</th><th>함께 있는 시설</th><th>시설 수</th></tr></thead>
            <tbody>
              {shown.map((f) => (
                <tr key={f.properties.address} className={`border-t border-line ${selected === f ? 'bg-[#f2f5df]' : ''}`}>
                  <td className="p-2"><button type="button" className="text-left font-semibold underline" onClick={() => setSelected(f)}>{f.properties.address}</button></td>
                  <td><div className="flex flex-wrap gap-1">{f.properties.kinds.map((kind) => <span key={kind} className="rounded bg-page px-2 py-1 text-xs">{kind}</span>)}</div></td>
                  <td className="whitespace-nowrap">{f.properties.kinds.length}종</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="admin-panel integrated-side flex h-[480px] flex-col gap-3 overflow-y-auto">
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-bold">선택한 후보</h2>
            {selected && <span className="rounded bg-accent px-2 py-0.5 text-xs font-bold text-brand">{selected.properties.kinds.length}종</span>}
          </div>
          {selected ? <>
            <p className="text-lg font-bold">{selected.properties.address}</p>
            <div>
              <h3 className="mb-1.5 text-sm font-bold">함께 확인할 시설</h3>
              <ul className="grid gap-2">
                {selected.properties.kinds.map((k) => <li key={k}>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input type="checkbox" checked={checked.has(k)} onChange={(e) => setChecked((cur) => { const n = new Set(cur); e.target.checked ? n.add(k) : n.delete(k); return n })} />
                    <span className="rounded bg-page px-2 py-1 text-xs font-semibold">{k}</span>
                    <span className="ml-auto text-xs text-sub">{checked.has(k) ? '확인 표시함' : '현장 확인 필요'}</span>
                  </label>
                </li>)}
              </ul>
            </div>
            <p className="rounded-lg bg-page p-3 text-xs text-sub">주소가 같아도 진입 위치는 다를 수 있습니다. 시설별 위치와 운영 상태를 현장에서 확인하세요.</p>
            <button type="button" className="admin-action w-full" onClick={() => setPlanMsg('점검 계획을 저장하는 기능은 아직 없습니다. 지금은 확인할 시설을 표시해 두는 용도입니다.')}>이 주소의 점검 계획 만들기</button>
            {planMsg && <p className="text-xs text-sub" role="status">{planMsg}</p>}
          </> : <p className="text-sm text-sub">목록이나 지도에서 주소를 선택하세요.</p>}
        </div>
      </div>
      <div className="admin-panel integrated-map-panel">
        <h2 className="mb-2 font-bold">후보 지도</h2>
        <div className="integrated-map relative h-[360px]">
          <div ref={el} className="absolute inset-0 overflow-hidden rounded-lg" aria-label="통합 점검 후보 지도" />
          <span className="resident-chip pointer-events-none absolute left-14 top-3 z-[500] bg-white text-xs">
            {zoom < MAX_CLUSTER_ZOOM ? '축소 · 후보 묶음' : '확대 · 개별 위치'}
          </span>
        </div>
      </div>
    </section>
  )
}
