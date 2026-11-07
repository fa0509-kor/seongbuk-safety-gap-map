// 지도 점 묶기: 멀리서 보면 가까운 점을 숫자 원으로 묶고, 확대하면 낱개로 풀린다 (부동산 앱 지도처럼).
// 의존 라이브러리 없이 화면 픽셀 거리로 묶는다. 주민 지도(MapPage)와 관리자 지도(통합 점검 후보, 점검 지도)가 같이 쓴다.
export const CLUSTER_PX = 44       // 화면에서 이 거리(픽셀) 안에 있는 점끼리 한 묶음 (거리 기준이라 격자 경계에 걸려 갈라지지 않음)
export const MAX_CLUSTER_ZOOM = 17 // 이 줌 이상에서는 묶지 않고 낱개로 보여 줌

// points: 점 목록, latLng(p) → [lat, lon]. 결과는 묶음 배열(각 묶음은 점 배열)
export function groupPoints(points, map, zoom, latLng) {
  if (zoom >= MAX_CLUSTER_ZOOM) return points.map((f) => [f])
  // 1) 위치 순으로 훑으며 가장 가까운 묶음(중심 기준)에 넣거나 새 묶음을 만든다. 순서를 고정해 같은 줌에서 늘 같은 결과가 나오게 함
  const sorted = [...points].sort((a, b) => latLng(a)[1] - latLng(b)[1] || latLng(a)[0] - latLng(b)[0])
  const groups = []
  sorted.forEach((f) => {
    const pt = map.project(latLng(f), zoom)
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

// 묶음 표시: 남색 숫자 원 (주민 지도와 같은 모양, index.css .resident-cluster). 누르면 묶음 범위로 확대
export function addCluster(L, layer, map, lls, onClick) {
  const center = lls.reduce((a, c) => [a[0] + c[0] / lls.length, a[1] + c[1] / lls.length], [0, 0])
  const size = Math.min(60, 34 + lls.length * 2)
  const icon = L.divIcon({ className: 'resident-cluster', iconSize: [size, size], html: String(lls.length) })
  return L.marker(center, { icon, alt: `${lls.length}곳 묶음` })
    .on('click', () => { onClick?.(); map.fitBounds(L.latLngBounds(lls), { padding: [40, 40], maxZoom: MAX_CLUSTER_ZOOM }) })
    .addTo(layer)
}
