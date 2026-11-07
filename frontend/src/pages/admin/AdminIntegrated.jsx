import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { api } from '../../lib/api.js'
import { addBaseLayer } from '../../lib/map.js'

// 통합 점검 후보: 같은 주소에 서로 다른 안전시설이 2종 이상 있는 곳.
// '공백'이 아니라 여러 부서(소방·보건·복지·교통)가 따로 점검하는 곳을 묶어 점검할 후보 (docs/decisions.md 10/19)
const KINDS = ['소방용수', 'AED', '무더위쉼터', '어린이보호구역']

export default function AdminIntegrated() {
  const el = useRef(null)
  const map = useRef(null)
  const layer = useRef(null)
  const [rows, setRows] = useState([])
  const [address, setAddress] = useState('')
  const [selected, setSelected] = useState(null)
  const [need, setNeed] = useState(2)
  const [kind, setKind] = useState('')

  useEffect(() => {
    map.current = L.map(el.current).setView([37.5894, 127.0167], 13)
    addBaseLayer(map.current)
    layer.current = L.layerGroup().addTo(map.current)
    api.adminIntegrated().then((g) => setRows(g.features)).catch(() => {})
    return () => map.current.remove()
  }, [])

  const shown = useMemo(() => rows
    .filter((f) => f.properties.address.includes(address.trim()))
    .filter((f) => f.properties.kinds.length >= need && (!kind || f.properties.kinds.includes(kind)))
    .sort((a, b) => b.properties.kinds.length - a.properties.kinds.length), [rows, need, kind, address])

  useEffect(() => {
    layer.current.clearLayers()
    shown.forEach((f) => {
      const [lon, lat] = f.geometry.coordinates
      const n = f.properties.kinds.length
      L.circleMarker([lat, lon], { radius: 3 + n * 2, color: '#001A47', fillOpacity: 0.6, weight: 1 })
        .on('click', () => setSelected(f)).addTo(layer.current)
    })
  }, [shown])

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
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white text-left text-gray-500"><tr><th className="p-2">주소</th><th>함께 있는 시설</th></tr></thead>
            <tbody>
              {shown.map((f) => (
                <tr key={f.properties.address} className="border-t">
                  <td className="p-2"><button type="button" className="text-left font-semibold underline" onClick={() => {
                    setSelected(f)
                    const [lon, lat] = f.geometry.coordinates
                    map.current.setView([lat, lon], 17)
                  }}>{f.properties.address}</button></td>
                  <td>{f.properties.kinds.join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="admin-panel grid content-start gap-3">
          <h2 className="font-bold">선택한 후보</h2>
          {selected ? <><p className="font-bold">{selected.properties.address}</p><ul className="grid gap-2 text-sm">{selected.properties.kinds.map((k) => <li key={k} className="rounded bg-page p-2">{k} · 현장 확인 필요</li>)}</ul></> : <p className="text-sm text-sub">목록에서 주소를 선택하세요.</p>}
          <div ref={el} className="h-52 overflow-hidden rounded-lg" aria-label="통합 점검 후보 지도" />
        </div>
      </div>
    </section>
  )
}
