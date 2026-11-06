import Brand from '../components/Brand.jsx'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import AIResultCard from '../components/AIResultCard.jsx'
import NearbyReports from '../components/NearbyReports.jsx'
import PhotoGuide from '../components/PhotoGuide.jsx'
import PhotoStrip from '../components/PhotoStrip.jsx'
import PinPicker from '../components/PinPicker.jsx'
import StepBar from '../components/StepBar.jsx'
import { takenAt } from '../lib/exif.js'
import { api } from '../lib/api.js'
import { currentPosition, resizeImage } from '../lib/image.js'
import { checkPhotoQuality } from '../lib/photoQuality.js'
import { myReports } from '../lib/myReports.js'

// 주민 2 제보: 1 사진(여러 장) → 2 위치(자동 + 핀 조정) → 3 확인(AI 결과, 시설 종류) → 보내기
// 사진은 목록 하나(photos)로 관리한다. 0번이 대표 사진이고 제보의 AI 분류·점수·지도 표시는 대표 사진만 쓴다. 사진마다 메모가 따로 있다.
// 올린 사진은 서버에 있으니 다른 화면에 갔다 와도 임시저장(키와 메모)으로 다시 불러온다.
// 시설 종류로 담당 부서가 정해진다 (서버 규칙, docs/departments.md). 모르면 '모름' → 안전점검 총괄 부서
// 체험용 사진: frontend/public/demo/sample.jpg (직접 찍은 사진만. AI-Hub 사진은 약관상 넣으면 안 됨)
// 제보 예시 안내 4개 (멘토 지적: 주민이 무엇을 찍어야 하는지 분명하게). 소방용수는 주민이 신경 쓰는 대상이 아니라 넣지 않음
const EXAMPLES = [
  ['옹벽·축대 균열', '금이 가거나 벌어졌거나 배가 부른 곳'],
  ['건물 외벽 균열', '벽이 갈라지거나 조각이 떨어지는 곳'],
  ['보도·계단 파손', '깨지고 패여서 넘어질 수 있는 곳'],
  ['흐려진 노면 표시', '횡단보도·정지선이 지워져 안 보이는 곳'],
]
const MAX_PHOTOS = 4
const photoSrc = (key) => `/api/photos/${key}` // 서버에 올라간 사진 (로컬은 바로, supabase는 서명 주소로 넘겨 줌)
const aiDraft = (ai) => (ai && !ai.mock && ai.category ? `${ai.category} 사진입니다. ${ai.reason ?? ''}`.trim().slice(0, 200) : '')

export default function Report() {
  const [params] = useSearchParams()
  const isDemo = params.get('demo') === '1'
  const navigate = useNavigate()
  const [photos, setPhotos] = useState([])   // [{key, preview, memo, takenAt, ai}] 최대 4장, 0번이 대표
  const [pos, setPos] = useState(null)       // 제보에 쓸 위치 (핀으로 바꿀 수 있음)
  const [locState, setLocState] = useState('finding') // finding / auto / manual / failed
  const [facilityTypes, setFacilityTypes] = useState({})
  const [facility, setFacility] = useState('unknown')
  const [aiDrafted, setAiDrafted] = useState(false) // 사진 메모 칸이 AI 초안으로 채워진 상태
  const [lastFiles, setLastFiles] = useState(null)  // '다시 시도'용
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)           // 제보 보내는 중
  const [error, setError] = useState('')
  const [draftBack, setDraftBack] = useState(false) // 임시저장을 불러온 상태
  const [draftReady, setDraftReady] = useState(false)

  // 임시저장 불러오기: 올려 둔 사진(서버에 있음)과 메모, 시설 종류
  useEffect(() => {
    const d = myReports.draft()
    if (d?.photos?.length) {
      setPhotos(d.photos.map((p) => ({ ...p, preview: photoSrc(p.key) })))
      setAiDrafted(!!d.aiDrafted)
      setDraftBack(true)
    }
    if (d?.facility) setFacility(d.facility)
    setDraftReady(true)
  }, [])
  // 바뀔 때마다 저장 (불러오기 전의 빈 값이 저장된 것을 지우지 않도록 불러온 뒤부터)
  useEffect(() => {
    if (!draftReady) return
    myReports.saveDraft({ photos: photos.map(({ key, memo, takenAt: t, ai, quality }) => ({ key, memo, takenAt: t, ai, quality })), facility, aiDrafted })
  }, [photos, facility, aiDrafted, draftReady])

  useEffect(() => {
    currentPosition().then((p) => {
      if (p) { setPos(p); setLocState('auto') } else setLocState('failed')
    })
    api.meta().then((m) => setFacilityTypes(m.facility_types)).catch(() => {})
  }, [])

  // 사진 올리기: 카메라로 찍은 1장이든 앨범에서 고른 여러 장이든 같은 길. 사진마다 AI가 메모 초안을 채운다.
  // 제보의 AI 분류와 점수는 대표(첫 번째) 사진만 쓰고, 다른 사진의 AI 결과는 메모 초안에만 쓴다.
  async function addFiles(files) {
    const list = [...files].slice(0, MAX_PHOTOS - photos.length)
    if (!list.length) return setError(`사진은 최대 ${MAX_PHOTOS}장까지 붙일 수 있어요.`)
    setError(''); setLastFiles(list); setUploading(true)
    try {
      for (const file of list) {
        const taken = await takenAt(file)
        const blob = await resizeImage(file)
        const quality = await checkPhotoQuality(blob) // 어둡거나 흔들렸는지 (경고만 함)
        const up = await api.uploadPhoto(blob)
        const draft = aiDraft(up.ai)
        if (draft) setAiDrafted(true)
        setPhotos((l) => (l.length >= MAX_PHOTOS ? l : [...l, { key: up.key, preview: URL.createObjectURL(blob), memo: draft, takenAt: taken, ai: up.ai, quality }]))
      }
      setLastFiles(null)
    } catch (e) { setError(`사진 처리 실패: ${e.message}`) } finally { setUploading(false) }
  }
  const setMemo = (i, v) => setPhotos((l) => l.map((p, k) => (k === i ? { ...p, memo: v } : p)))
  const removePhoto = (i) => setPhotos((l) => l.filter((_, k) => k !== i))                    // 대표를 지우면 다음 사진이 대표가 됨
  const makeMain = (i) => setPhotos((l) => [l[i], ...l.filter((_, k) => k !== i)])           // 가장 문제가 잘 보이는 사진을 대표로

  async function useDemoPhoto() {
    const res = await fetch('/demo/sample.jpg')
    if (!res.ok) return setError('체험용 사진이 아직 없음 (frontend/public/demo/sample.jpg)')
    addFiles([await res.blob()])
  }

  async function submit() {
    setBusy(true); setError('')
    try {
      const [main, ...rest] = photos
      const r = await api.createReport({
        photo_key: main.key, lat: pos?.lat ?? null, lon: pos?.lon ?? null, accuracy_m: pos?.accuracy ?? null,
        memo: null, is_demo: isDemo, facility_type: facility,
        client_key: myReports.clientKey(), client_nickname: myReports.nickname() || null, // 같은 브라우저에서 올라온 제보를 담당자가 확인하는 용도(사람을 특정하지 않음)
        taken_at: main.takenAt, photo_memo: main.memo || null,
        extra_photos: rest.map((x) => ({ photo_key: x.key, memo: x.memo || null, taken_at: x.takenAt })),
      })
      myReports.clearDraft()
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

  const main = photos[0]
  const steps = [['사진', photos.length > 0], ['위치', !!pos], ['확인', !!main?.ai]]
  return (
    <section className="flex min-h-full flex-col gap-3 bg-page px-5 pb-6 pt-6 text-ink report-page">
      <header className="resident-header"><div className="flex items-center gap-1"><Link to="/" aria-label="뒤로" className="flex h-11 w-8 shrink-0 items-center">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </Link><Brand /></div><h1>제보하기{isDemo && <span className="ml-1 text-sm text-amber-600">(체험)</span>}</h1></header>
      <StepBar steps={steps} />
      {draftBack && photos.length > 0 && <p className="rounded-lg bg-white px-3 py-2 text-[13px] text-sub">쓰던 제보를 불러왔어요. 올려 둔 사진과 메모가 그대로 있어요.</p>}
      <p className="text-[13px] text-sub">얼굴·차량 번호판이 나오지 않게, 길에서만 찍어 주세요. 사진 속 위치 정보(EXIF)는 지우고 저장합니다.</p>

      <div>
        <p className="mb-1.5 text-sm font-semibold">이런 걸 찍어 주세요</p>
        <div className="grid grid-cols-2 gap-2">
          {EXAMPLES.map(([title, desc]) => (
            <div key={title} className="rounded-xl border border-line bg-white px-3 py-2.5">
              <div className="text-sm font-semibold">{title}</div>
              <div className="mt-0.5 text-[13px] leading-snug text-sub">{desc}</div>
            </div>
          ))}
        </div>
      </div>

      <PhotoGuide />

      {main ? (
        <div className="relative overflow-hidden rounded-2xl bg-gray-300">
          <img src={main.preview} alt="대표 사진" className="block max-h-[320px] w-full object-cover" />
          <span className="absolute left-2 top-2 rounded bg-ink px-2 py-0.5 text-xs font-semibold text-white">대표 사진</span>
        </div>
      ) : (
        <div className="flex min-h-[150px] flex-col items-center justify-center gap-2 rounded-2xl bg-gray-300 p-3">
          {isDemo
            ? <button type="button" onClick={useDemoPhoto} className="rounded-lg bg-white/90 px-4 py-2 text-sm font-medium">체험용 사진 불러오기</button>
            : (
              <div className="flex flex-wrap items-center justify-center gap-2">
                <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg bg-white/90 px-4 text-sm font-semibold">
                  카메라로 찍기
                  <input type="file" accept="image/*" capture="environment" className="hidden" disabled={uploading}
                    onChange={(e) => { if (e.target.files.length) addFiles(e.target.files); e.target.value = '' }} />
                </label>
                <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg bg-white/90 px-4 text-sm font-semibold">
                  앨범에서 고르기 (여러 장 가능)
                  <input type="file" accept="image/*" multiple className="hidden" disabled={uploading}
                    onChange={(e) => { if (e.target.files.length) addFiles(e.target.files); e.target.value = '' }} />
                </label>
              </div>
            )}
        </div>
      )}
      {uploading && <p className="text-[13px] text-sub">AI가 사진을 보고 있어요. 보통 5초쯤 걸리고, 처음에는 10초 넘게 걸릴 수 있어요. 이 화면을 닫지 말고 기다려 주세요.</p>}
      {error && !uploading && lastFiles && (
        <button type="button" onClick={() => addFiles(lastFiles)} className="h-11 rounded-xl border border-brand text-sm font-semibold text-brand">다시 시도</button>
      )}

      <div className="flex flex-col gap-2 rounded-xl border border-line bg-white p-3">
        <div className="flex items-center gap-2.5 text-sm">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#001A47" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
          <span className="flex-1">{locText}</span>
        </div>
        <PinPicker value={pos} onChange={(p) => { setPos(p); setLocState('manual') }} />
        {pos && <p className="text-[13px] text-sub">{pos.lat.toFixed(5)}, {pos.lon.toFixed(5)} · 핀을 끌어 옮길 수 있어요</p>}
      </div>

      {photos.length > 0 && <PhotoStrip items={photos} onMemo={setMemo} onRemove={removePhoto} onMakeMain={makeMain} onAdd={addFiles} adding={uploading} max={MAX_PHOTOS} aiDrafted={aiDrafted} />}
      {main?.ai && <AIResultCard ai={main.ai} highlight />}
      {main && <NearbyReports pos={pos} accuracy={pos?.accuracy} category={main.ai && !main.ai.mock ? main.ai.category : null} />}

      <div>
        <p className="mb-1.5 text-sm text-sub">어떤 시설인가요? (담당 부서를 정하는 데 씁니다)</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(facilityTypes).map(([code, label]) => (
            <button key={code} type="button" onClick={() => setFacility(code)}
              className={`h-11 rounded-full border px-3.5 text-sm ${facility === code ? 'border-brand bg-brand text-white' : 'border-line bg-white'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[13px] text-sub">제보와 함께 이 브라우저의 식별번호 {myReports.clientCode()}{myReports.nickname() && ` · 별명 ${myReports.nickname()}`}가 저장돼요. 이름·연락처가 아니고, 내 제보 화면에서 확인할 수 있어요.</p>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button type="button" disabled={!main || busy || uploading} onClick={submit}
        className="h-[52px] rounded-2xl bg-brand text-base font-semibold text-white disabled:opacity-40">제보 보내기</button>
    </section>
  )
}
