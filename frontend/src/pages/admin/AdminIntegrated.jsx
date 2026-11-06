import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { api } from '../../lib/api.js'
import { addBaseLayer } from '../../lib/map.js'

// 통합 점검 후보 (Figma 11/04 최종): 같은 주소에 서로 다른 안전시설이 2종 이상 있는 곳.
// '공백'이 아니라 여러 부서(소방·보건·복지·교통)가 따로 점검하는 곳을 묶어 점검할 후보 (docs/decisions.md 10/19)
const KINDS = ['소방용수', 'AED', '무더위쉼터', '어린이보호구역']
const PAGE = 8
const kindClass = { 소방용수: 'k-water', AED: 'k-aed', 무더위쉼터: 'k-heat', 어린이보호구역: 'k-child' }

export default function AdminIntegrated() {
  const el = useRef(null)
  const map = useRef(null)
  const layer = useRef(null)
  const [rows, setRows] = useState([])
  const [need, setNeed] = useState(2)
  const [kind, setKind] = useState('')
  const [keyword, setKeyword] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [picked, setPicked] = useState(null)

  useEffect(() => {
    map.current = L.map(el.current).setView([37.5894, 127.0167], 13)
    addBaseLayer(map.current)
    layer.current = L.layerGroup().addTo(map.current)
    api.adminIntegrated().then((g) => setRows(g.features)).catch(() => {})
    return () => map.current.remove()
  }, [])

  const shown = useMemo(() => rows
    .filter((f) => f.properties.kinds.length >= need && (!kind || f.properties.kinds.includes(kind)) && (!q || f.properties.address.includes(q)))
    .sort((a, b) => b.properties.kinds.length - a.properties.kinds.length), [rows, need, kind, q])
  const pages = Math.max(1, Math.ceil(shown.length / PAGE))
  const view = shown.slice((page - 1) * PAGE, page * PAGE)
  const current = picked && shown.find((f) => f.properties.address === picked) ? picked : view[0]?.properties.address
  const sel = shown.find((f) => f.properties.address === current)

  useEffect(() => {
    layer.current.clearLayers()
    shown.forEach((f) => {
      const [lon, lat] = f.geometry.coordinates
      const n = f.properties.kinds.length
      const on = f.properties.address === current
      L.circleMarker([lat, lon], { radius: 3 + n * 2, color: '#001A47', fillColor: on ? '#bfd300' : '#001A47', fillOpacity: on ? 0.9 : 0.6, weight: on ? 2 : 1 })
        .bindPopup(`${f.properties.address}<br>${f.properties.kinds.join(' · ')}`).on('click', () => setPicked(f.properties.address)).addTo(layer.current)
    })
  }, [shown, current])

  return (
    <section className="flex flex-col gap-5">
      <div className="page-head">
        <div><h1>통합 점검 후보</h1><p>같은 주소의 안전시설을 함께 확인하고, 부서 간 통합 점검을 준비하세요.</p></div>
      </div>
      <div className="integrated-banner">
        <div className="flex items-center gap-3"><b>{shown.length}곳</b><span className="chip chip-lime">{need === 4 ? '4종 모두' : `${need}종 이상`}</span></div>
        <div><strong>한 번의 방문으로, 여러 시설을 함께 점검하세요.</strong><p>동일 주소에 {need}종 이상 안전시설이 있는 곳입니다. 같은 출입문인지는 현장에서 확인해야 합니다.</p></div>
      </div>
      <form className="admin-card filter-card" onSubmit={(e) => { e.preventDefault(); setQ(keyword); setPage(1) }}>
        <label className="filter-field filter-wide"><span>주소 검색</span><input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="도로명 또는 건물 주소 검색" /></label>
        <label className="filter-field"><span>함께 있는 시설 수</span>
          <select value={need} onChange={(e) => { setNeed(Number(e.target.value)); setPage(1) }}><option value={2}>2종 이상</option><option value={3}>3종 이상</option><option value={4}>4종 모두</option></select></label>
        <label className="filter-field"><span>포함할 시설</span>
          <select value={kind} onChange={(e) => { setKind(e.target.value); setPage(1) }}><option value="">전체 시설</option>{KINDS.map((k) => <option key={k} value={k}>{k} 포함</option>)}</select></label>
        <div className="filter-actions"><button type="submit" className="btn-dark">조회</button></div>
      </form>
      <div className="integrated-grid grid grid-cols-[1fr_340px] gap-4">
        <div className="admin-card table-card">
          <div className="card-title"><h2>후보 주소 <small>{shown.length}곳</small></h2><span className="text-xs text-sub">시설 수 많은 순</span></div>
          <div className="overflow-x-auto">
            <table className="admin-plain-table w-full text-sm">
              <thead><tr><th>주소</th><th>함께 있는 시설</th><th>시설 수</th></tr></thead>
              <tbody>
                {view.map((f) => (
                  <tr key={f.properties.address} className={f.properties.address === current ? 'is-picked' : ''} onClick={() => setPicked(f.properties.address)}>
                    <td data-label="주소"><b>{f.properties.address}</b></td>
                    <td data-label="함께 있는 시설"><span className="kind-chips">{f.properties.kinds.map((k) => <span key={k} className={`kind-chip ${kindClass[k] ?? ''}`}>{k}</span>)}</span></td>
                    <td data-label="시설 수" className="font-semibold">{f.properties.kinds.length}종</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!view.length && <p className="p-4 text-sub">조건에 맞는 곳이 없습니다.</p>}
          <div className="pager">
            <span>총 {shown.length}곳 중 {shown.length ? (page - 1) * PAGE + 1 : 0}~{Math.min(page * PAGE, shown.length)}곳</span>
            <div>
              <button type="button" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} aria-label="이전">‹</button>
              <button type="button" className="is-current">{page}</button><em>/ {pages}</em>
              <button type="button" onClick={() => setPage(Math.min(pages, page + 1))} disabled={page === pages} aria-label="다음">›</button>
            </div>
          </div>
        </div>
        <aside className="admin-card picked-card">
          <div className="card-title"><h2>선택한 후보</h2>{sel && <span className="chip chip-lime">{sel.properties.kinds.length}종</span>}</div>
          {sel ? <>
            <p className="picked-address">{sel.properties.address}</p>
            <p className="text-xs text-sub">서울특별시 성북구 · 도로명주소 기준</p>
            <h3 className="mt-4 text-sm font-semibold">함께 확인할 시설</h3>
            <ul className="picked-list">{sel.properties.kinds.map((k) => <li key={k}><span className={`kind-chip ${kindClass[k] ?? ''}`}>{k}</span><em>현장 확인 필요</em></li>)}</ul>
            <p className="picked-note">주소가 같아도 진입 위치는 다를 수 있습니다. 시설별 위치와 운영 상태를 함께 확인하세요.</p>
          </> : <p className="text-sm text-sub">후보를 선택하면 자세한 내용이 표시됩니다.</p>}
        </aside>
      </div>
      <div className="admin-card">
        <div className="card-title"><h2>점검 지도</h2><span className="text-xs text-sub">선택한 후보는 라임색으로 표시됩니다.</span></div>
        <div ref={el} className="mt-3 h-[360px] rounded-xl" />
      </div>
    </section>
  )
}
