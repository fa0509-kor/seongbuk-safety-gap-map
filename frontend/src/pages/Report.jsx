import Brand from '../components/Brand.jsx'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import AIResultCard from '../components/AIResultCard.jsx'
import NearbyReports from '../components/NearbyReports.jsx'
import PhotoStrip from '../components/PhotoStrip.jsx'
import PinPicker from '../components/PinPicker.jsx'
import { takenAt } from '../lib/exif.js'
import { api } from '../lib/api.js'
import { currentPosition, resizeImage } from '../lib/image.js'
import { myReports } from '../lib/myReports.js'

// 주민 2 제보: 1 사진 → 2 위치(자동 + 핀 조정) → 3 확인(AI 결과, 시설 종류, 메모) → 보내기
// 와이어프레임 '주민 2 · 제보' 배치. 데이터 흐름(위 함수들)은 그대로. 시설 종류 선택은 와이어프레임에 없지만 담당 부서 배정에 필요해서 유지
// 시설 종류로 담당 부서가 정해진다 (서버 규칙, docs/departments.md). 모르면 '모름' → 안전점검 총괄 부서
// 체험용 사진: frontend/public/demo/sample.jpg (직접 찍은 사진만. AI-Hub 사진은 약관상 넣으면 안 됨)
// 제보 예시 안내 4개 (멘토 지적: 주민이 무엇을 찍어야 하는지 분명하게). 소방용수는 주민이 신경 쓰는 대상이 아니라 넣지 않음
const EXAMPLES = [
  ['옹벽·축대 균열', '금이 가거나 벌어졌거나 배가 부른 곳'],
  ['건물 외벽 균열', '벽이 갈라지거나 조각이 떨어지는 곳'],
  ['보도·계단 파손', '깨지고 패여서 넘어질 수 있는 곳'],
  ['흐려진 노면 표시', '횡단보도·정지선이 지워져 안 보이는 곳'],
]

export default function Report() {
  const [params] = useSearchParams()
  const isDemo = params.get('demo') === '1'
  const navigate = useNavigate()
  const [photo, setPhoto] = useState(null)   // POST /api/photos 응답
  const [preview, setPreview] = useState(null)
  const [pos, setPos] = useState(null)       // 제보에 쓸 위치 (핀으로 바꿀 수 있음)
  const [locState, setLocState] = useState('finding') // finding / auto / manual / failed
  const [facilityTypes, setFacilityTypes] = useState({})
  const [facility, setFacility] = useState('unknown')
  const [memo, setMemo] = useState('')
  const [memoFromAI, setMemoFromAI] = useState(false) // 메모칸이 AI 초안으로 채워진 상태
  const [lastFile, setLastFile] = useState(null) // '다시 시도'용
  const [photoMemo, setPhotoMemo] = useState('')    // 대표 사진 메모
  const [mainTaken, setMainTaken] = useState(null)  // 대표 사진 촬영 일시
  const [extras, setExtras] = useState([])         // 추가 사진 [{key, preview, memo, takenAt}], 최대 3장
  const [active, setActive] = useState(null)       // 메모를 적고 있는 사진 번호
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    currentPosition().then((p) => {
      if (p) { setPos(p); setLocState('auto') } else setLocState('failed')
    })
    api.meta().then((m) => setFacilityTypes(m.facility_types)).catch(() => {})
  }, [])

  async function handleFile(file) {
    setError(''); setBusy(true); setPhoto(null); setLastFile(file)
    try {
      setMainTaken(await takenAt(file))
      const blob = await resizeImage(file)
      setPreview(URL.createObjectURL(blob))
      const up = await api.uploadPhoto(blob)
      setPhoto(up)
      // 메모를 비워 둔 경우에만 AI가 본 내용으로 초안을 채운다 (임시 결과는 쓰지 않음). 주민이 고쳐서 보낼 수 있다.
      if (!memo.trim() && up.ai && !up.ai.mock && up.ai.category) {
        setMemo(`${up.ai.category} 사진입니다. ${up.ai.reason ?? ''}`.trim().slice(0, 200)); setMemoFromAI(true)
      }
    } catch (e) { setError(`사진 처리 실패: ${e.message}`) } finally { setBusy(false) }
  }

  // 사진 추가: AI 분류는 대표 사진만 하므로 추가 사진은 저장만 한다 (classify=false)
  async function addPhotos(files) {
    setError(''); setAdding(true)
    try {
      const next = [...extras]
      for (const file of files) {
        if (next.length >= 3) break
        const blob = await resizeImage(file)
        const up = await api.uploadPhoto(blob, { classify: false })
        next.push({ key: up.key, preview: URL.createObjectURL(blob), memo: '', takenAt: await takenAt(file) })
      }
      setExtras(next)
    } catch (e) { setError(`사진 추가 실패: ${e.message}`) } finally { setAdding(false) }
  }
  const stripItems = photo ? [{ key: 'main', preview, memo: photoMemo, takenAt: mainTaken }, ...extras] : []
  const setItemMemo = (i, v) => (i === 0 ? setPhotoMemo(v) : setExtras((l) => l.map((x, k) => (k === i - 1 ? { ...x, memo: v } : x))))
  const removeItem = (i) => { setExtras((l) => l.filter((_, k) => k !== i - 1)); setActive(null) }

  async function useDemoPhoto() {
    const res = await fetch('/demo/sample.jpg')
    if (!res.ok) return setError('체험용 사진이 아직 없음 (frontend/public/demo/sample.jpg)')
    handleFile(await res.blob())
  }

  async function submit() {
    setBusy(true); setError('')
    try {
      const r = await api.createReport({
        photo_key: photo.key, lat: pos?.lat ?? null, lon: pos?.lon ?? null,
        memo: memo || null, is_demo: isDemo, facility_type: facility,
        taken_at: mainTaken, photo_memo: photoMemo || null,
        extra_photos: extras.map((x) => ({ photo_key: x.key, memo: x.memo || null, taken_at: x.takenAt })),
      })
      myReports.add(r.public_id)
      myReports.markSeen() // 방금 보낸 제보는 '새 소식'이 아님 → 빨간 점은 담당자가 처리할 때부터
      navigate('/my')
    } catch (e) { setError(`제보 실패: ${e.message}`) } finally { setBusy(false) }
  }

  const locText = {
    finding: '현재 위치 찾는 중… (지도를 눌러 직접 지정해도 됩니다)',
    auto: '현재 위치로 잡았어요. 다르면 핀을 끌어 옮겨 주세요.',
    manual: '지정한 위치로 보냅니다.',
    failed: '위치를 못 가져왔어요 (https 주소에서만 동작). 지도를 눌러 위치를 지정해 주세요.',
  }[locState]

  const steps = [['사진', !!photo], ['위치', !!pos], ['확인', !!photo]]
  return (
    <section className="flex min-h-full flex-col gap-3 bg-page px-5 pb-6 pt-6 text-ink report-page">
      <header className="resident-header"><div className="flex items-center gap-1"><Link to="/" aria-label="뒤로" className="flex h-11 w-8 shrink-0 items-center">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </Link><Brand /></div><h1>제보하기{isDemo && <span className="ml-1 text-sm text-amber-600">(체험)</span>}</h1></header>
      <div className="grid grid-cols-3 gap-1.5">
        {steps.map(([label, done]) => <div key={label} className={`h-1 rounded ${done ? 'bg-brand' : 'bg-gray-300'}`} />)}
      </div>
      <div className="flex justify-between text-xs text-sub">{steps.map(([label], i) => <span key={label}>{i + 1} {label}</span>)}</div>
      <p className="text-xs text-sub">얼굴·차량 번호판이 나오지 않게, 길에서만 찍어 주세요. 사진 속 위치 정보(EXIF)는 지우고 저장합니다.</p>

      <div>
        <p className="mb-1.5 text-[13px] font-semibold">이런 걸 찍어 주세요</p>
        <div className="grid grid-cols-2 gap-2">
          {EXAMPLES.map(([title, desc]) => (
            <div key={title} className="rounded-xl border border-line bg-white px-3 py-2.5">
              <div className="text-[13px] font-semibold">{title}</div>
              <div className="mt-0.5 text-xs leading-snug text-sub">{desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="relative flex min-h-[150px] flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gray-300 p-3">
        {preview && <img src={preview} alt="제보 사진" className="absolute inset-0 h-full w-full object-cover" />}
        <div className="relative flex flex-col items-center gap-2">
          {isDemo
            ? <button type="button" onClick={useDemoPhoto} className="rounded-lg bg-white/90 px-4 py-2 text-sm font-medium">체험용 사진 불러오기</button>
            : <label className="cursor-pointer rounded-lg bg-white/90 px-4 py-2 text-sm font-medium">
                {preview ? '사진 다시 찍기' : '사진 찍기·고르기'}
                <input type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])} />
              </label>}
          {busy && !photo && <span className="rounded bg-white/90 px-2 py-1 text-xs">AI가 사진을 보는 중…</span>}
        </div>
      </div>
      {busy && !photo && <p className="-mt-2 text-xs text-sub">AI가 사진을 보고 있어요. 보통 5초쯤 걸리고, 처음에는 10초 넘게 걸릴 수 있어요. 이 화면을 닫지 말고 기다려 주세요.</p>}
      {error && !busy && lastFile && !photo && (
        <button type="button" onClick={() => handleFile(lastFile)} className="h-10 rounded-xl border border-brand text-sm font-semibold text-brand">다시 시도</button>
      )}

      <div className="flex flex-col gap-2 rounded-xl border border-line bg-white p-3">
        <div className="flex items-center gap-2.5 text-sm">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#001A47" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
          <span className="flex-1">{locText}</span>
        </div>
        <PinPicker value={pos} onChange={(p) => { setPos(p); setLocState('manual') }} />
        {pos && <p className="text-xs text-gray-400">{pos.lat.toFixed(5)}, {pos.lon.toFixed(5)} · 핀을 끌어 옮길 수 있어요</p>}
      </div>

      {photo && <PhotoStrip items={stripItems} active={active} onActive={setActive} onMemo={setItemMemo} onRemove={removeItem} onAdd={addPhotos} adding={adding} />}
      {photo && <AIResultCard ai={photo.ai} highlight />}
      {photo && <NearbyReports pos={pos} category={photo.ai && !photo.ai.mock ? photo.ai.category : null} />}

      <div>
        <p className="mb-1.5 text-[13px] text-sub">어떤 시설인가요? (담당 부서를 정하는 데 씁니다)</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(facilityTypes).map(([code, label]) => (
            <button key={code} type="button" onClick={() => setFacility(code)}
              className={`h-9 rounded-full border px-3 text-sm ${facility === code ? 'border-brand bg-brand text-white' : 'border-line bg-white'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <label className="flex flex-col gap-1.5 text-[13px] text-sub">한 줄 메모 (선택)
        <input value={memo} onChange={(e) => { setMemo(e.target.value); setMemoFromAI(false) }} maxLength={200}
          placeholder="예: 비 온 뒤 금이 더 커졌어요" className="h-11 rounded-xl border border-line bg-white px-3 text-[15px] text-ink" />
        {memoFromAI && <span className="text-xs">AI가 사진을 보고 쓴 초안이에요. 고쳐서 보내셔도 됩니다.</span>}
      </label>

      {error && <p className="text-sm text-danger">{error}</p>}
      <button type="button" disabled={!photo || busy} onClick={submit}
        className="h-[52px] rounded-2xl bg-brand text-base font-semibold text-white disabled:opacity-40">제보 보내기</button>
    </section>
  )
}
