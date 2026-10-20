// 지도 배경 타일 설정 (한곳에서만 바꾼다)
// 2026-10-20: CARTO 기본 지도가 API 키를 요구하게 바뀌어("API KEY REQUIRED" 워터마크) OSM 표준 타일로 교체.
// OSM 타일 사용 정책: 사람이 보는 화면에 필요한 타일만, 지도 위 출처 표기 필수, 대량 다운로드·오프라인 저장 금지.
// https://operations.osmfoundation.org/policies/tiles/
// 한국 공식 지도(브이월드)나 카카오맵으로 바꾸려면 키 발급 후 이 파일만 고치면 됨.
import L from 'leaflet'

export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

export function addBaseLayer(map) {
  return L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(map)
}
