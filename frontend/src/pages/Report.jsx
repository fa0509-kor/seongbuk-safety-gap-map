import ResidentHeader from '../components/ResidentHeader.jsx'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toPolite } from '../lib/politeKo.js'
import AIResultCard from '../components/AIResultCard.jsx'
import NearbyReports from '../components/NearbyReports.jsx'
import PhotoGuide from '../components/PhotoGuide.jsx'
import PinPicker from '../components/PinPicker.jsx'
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
const aiDraft = (ai) => (ai && !ai.mock && ai.category ? `${ai.category} 사진입니다. ${toPolite(ai.reason ?? '')}`.trim().slice(0, 200) : '')

export default function Report() {
  const [params] = useSearchParams()
  const isDemo = params.get('demo') === '1'
  const navigate = useNavigate()
  const [index, setIndex] = useState(null)
  const [editingLocation, setEditingLocation] = useState(false)
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
    if (isDemo) return
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
      if (p) {
        setPos((current) => current ?? p)
        setLocState((state) => state === 'manual' ? state : 'auto')
      } else setLocState((state) => state === 'manual' ? state : 'failed')
    })
    api.meta().then((m) => setFacilityTypes(m.facility_types)).catch(() => {})
  }, [])

  // 사진 올리기: 카메라로 찍은 1장이든 앨범에서 고른 여러 장이든 같은 길. 사진마다 AI가 메모 초안을 채운다.
  // 제보의 AI 분류와 점수는 대표(첫 번째) 사진만 쓰고, 다른 사진의 AI 결과는 메모 초안에만 쓴다.
  async function addFiles(files) {
    const list = [...files].slice(0, MAX_PHOTOS - photos.length)
    if (!list.length) return setError(`사진은 최대 ${MAX_PHOTOS}장까지 붙일 수 있어요.`)
    setError(''); setLastFiles(list); setUploading(true)
    let uploaded = 0
    try {
      for (const file of list) {
        const taken = await takenAt(file)
        const blob = await resizeImage(file)
        const quality = await checkPhotoQuality(blob) // 어둡거나 흔들렸는지 (경고만 함)
        const up = await api.uploadPhoto(blob)
        const draft = aiDraft(up.ai)
        if (draft) setAiDrafted(true)
        setPhotos((l) => (l.length >= MAX_PHOTOS ? l : [...l, { key: up.key, preview: URL.createObjectURL(blob), memo: draft, takenAt: taken, ai: up.ai, quality }]))
        uploaded += 1
      }
      setLastFiles(null)
    } catch (e) { setLastFiles(list.slice(uploaded)); setError(`사진 처리 실패: ${e.message}`) } finally { setUploading(false) }
  }
  const setMemo = (i, v) => setPhotos((l) => l.map((p, k) => (k === i ? { ...p, memo: v } : p)))
  const removePhoto = (i) => setPhotos((l) => l.filter((_, k) => k !== i))                    // 대표를 지우면 다음 사진이 대표가 됨
  const makeMain = (i) => setPhotos((l) => [l[i], ...l.filter((_, k) => k !== i)])           // 가장 문제가 잘 보이는 사진을 대표로

  // 체험용 사진 3장(sample.jpg, sample2.jpg, sample3.jpg). 첫 장이 없으면 오류, 나머지가 없으면 있는 것만 붙인다.
  async function useDemoPhoto() {
    const res = await Promise.all(['sample.jpg', 'sample2.jpg', 'sample3.jpg'].map((f) => fetch('/demo/' + f)))
    if (!res[0].ok) return setError('체험용 사진이 아직 없음 (frontend/public/demo/sample.jpg)')
    addFiles(await Promise.all(res.filter((r) => r.ok).map((r) => r.blob())))
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
      if (!isDemo) myReports.clearDraft()
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

  const photo = index === null ? null : photos[index]
  const locked = busy || uploading
  const go = (next) => {
    setEditingLocation(false)
    setIndex(next)
  }
  const choose = (e) => {
    if (e.target.files.length) addFiles(e.target.files)
    e.target.value = ''
  }
  return (
    <section className="resident-screen min-h-full">
      <ResidentHeader caption={photo ? '‹ 제보하기 / 2단계' : '‹ 제보하기 / 1단계'}
        title={photo ? `사진 ${index + 1} 확인하기` : '사진으로 제보하기'} />
      {photo ? <>
        <div className="resident-card grid gap-2">
          <div className="flex items-center justify-between text-sm font-bold">
            사진 {index + 1} / {photos.length}
            {index === 0 && <span className="resident-chip bg-[#ebefcb]">대표 사진</span>}
          </div>
          <img src={photo.preview} alt="선택한 제보 사진" className="h-[102px] w-full rounded-xl object-cover" />
        </div>
        <div className="resident-card grid gap-2">
          <div className="flex items-center justify-between text-sm font-bold">위치
            <button type="button" disabled={locked} className="resident-chip bg-[#ebefcb]"
              onClick={() => setEditingLocation(!editingLocation)}>{editingLocation ? '위치 확인' : '위치 수정'}</button>
          </div>
          {editingLocation
            ? <PinPicker key="edit" value={pos} onChange={(p) => { setPos(p); setLocState('manual') }} />
            : pos && <PinPicker key="preview" value={pos} readOnly />}
          <p className="text-xs text-sub">{pos ? `${pos.lat.toFixed(5)}, ${pos.lon.toFixed(5)} · 제보 공통 위치` : locText}</p>
        </div>
        <fieldset disabled={locked} className="resident-card grid gap-2">
          <legend className="sr-only">시설 종류</legend>
          <h2 className="text-sm font-bold">시설 종류</h2>
          <p className="text-xs text-sub">대표 사진 속 시설을 하나 골라 주세요.</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(facilityTypes).map(([code, label]) => (
              <button key={code} type="button" aria-pressed={facility === code} onClick={() => setFacility(code)}
                className={`rounded-xl border px-2.5 py-2 text-xs ${facility === code ? 'border-brand bg-brand font-bold text-white' : 'border-line bg-page'}`}>
                {facility === code && '✓ '}{label}
              </button>
            ))}
          </div>
        </fieldset>
        {photo.ai && <div className="resident-ai"><AIResultCard ai={photo.ai} highlight /></div>}
        <div className="resident-card grid gap-2">
          <label className="grid gap-2 text-sm font-bold">자세한 설명
            <textarea className="min-h-16 rounded-2xl bg-page p-3 text-sm font-normal" maxLength={200}
              value={photo.memo} disabled={locked} onChange={(e) => setMemo(index, e.target.value)} />
          </label>
          <p className="text-xs text-sub">{aiDrafted ? 'AI 초안을 확인하고 실제 상황에 맞게 고쳐 주세요.' : '실제 상황을 자세히 적어 주세요.'}</p>
        </div>
        {index === photos.length - 1 && <>
          <NearbyReports pos={pos} accuracy={pos?.accuracy} category={photos[0].ai && !photos[0].ai.mock ? photos[0].ai.category : null} />
          <p className="text-xs text-sub">제보와 함께 이 브라우저의 식별번호 {myReports.clientCode()}{myReports.nickname() && ` · 별명 ${myReports.nickname()}`}가 저장돼요.</p>
        </>}
      </> : <>
        <div className="rounded-[20px] bg-[#ebefcb] p-3.5">
          <h2 className="text-lg font-bold">이런 걸 찍어 주세요</h2>
          <p className="my-2 text-sm text-sub">위험한 곳과 주변이 잘 보이도록<br />안전한 거리에서 촬영해 주세요.</p>
          <div className="grid grid-cols-2 gap-2">
            {EXAMPLES.map(([title, desc]) => <div key={title} className="rounded-xl bg-white p-2.5">
              <h3 className="text-[13px] font-bold">{title}</h3><p className="text-xs text-sub">{desc}</p>
            </div>)}
          </div>
        </div>
        <PhotoGuide />
        <div className="resident-card grid gap-2">
          <h2 className="text-lg font-bold">사진 추가</h2>
          <p className="text-sm text-sub">여러 장을 한 번에 고를 수 있어요. 최대 {MAX_PHOTOS}장</p>
          {isDemo ? <button type="button" onClick={useDemoPhoto} disabled={locked || photos.length > 0} className="resident-primary">체험용 사진 불러오기</button>
            : <div className="grid grid-cols-2 gap-2">
              <label className="resident-primary grid cursor-pointer place-items-center text-center text-sm focus-within:outline">사진 찍기
                <input type="file" accept="image/*" capture="environment" disabled={locked || photos.length >= MAX_PHOTOS} onChange={choose} className="sr-only" />
              </label>
              <label className="resident-primary grid cursor-pointer place-items-center text-center text-sm focus-within:outline">앨범에서 고르기
                <input type="file" accept="image/*" multiple disabled={locked || photos.length >= MAX_PHOTOS} onChange={choose} className="sr-only" />
              </label>
            </div>}
          <p className="text-xs text-sub">얼굴이나 차량 번호판이 나오지 않도록 찍어 주세요.</p>
        </div>
        {photos.length > 0 && <div className="resident-card grid gap-2">
          <h2 className="font-bold">선택한 사진 {photos.length}장</h2>
          {draftBack && <p className="text-xs text-sub">쓰던 제보를 불러왔어요.</p>}
          <div className="grid grid-cols-2 gap-2.5">
            {photos.map((item, i) => <div key={item.key} className="relative">
              <img src={item.preview} alt={`선택한 사진 ${i + 1}`} className="h-[102px] w-full rounded-xl object-cover" />
              <button type="button" disabled={locked} aria-label={`${i + 1}번 사진 삭제`} onClick={() => removePhoto(i)}
                className="absolute right-1 top-1 grid size-8 place-items-center rounded-full bg-white text-lg">×</button>
              {i === 0 ? <p className="text-xs font-bold">대표 사진</p> :
                <button type="button" disabled={locked} className="text-xs underline" onClick={() => makeMain(i)}>대표로 지정</button>}
            </div>)}
          </div>
          <p className="text-xs text-sub">다음 단계에서 사진마다 위치와 설명을 확인해요.</p>
        </div>}
        {isDemo && <Link to="/report" className="text-center text-xs underline">일반 제보로 돌아가기</Link>}
      </>}
      {uploading && <p role="status" className="text-sm text-sub">AI가 사진을 보고 있어요. 잠시 기다려 주세요.</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {!locked && lastFiles && <button type="button" onClick={() => addFiles(lastFiles)} className="rounded-xl border border-line py-2 text-sm">실패한 사진 다시 시도</button>}
      <div className="mt-auto grid gap-2 pt-2">
        {photo ? <>
          <p className="text-center text-xs font-semibold text-sub">{index + 1} / {photos.length}</p>
          <div className="grid grid-cols-[1fr_2fr] gap-2">
            <button type="button" disabled={locked} onClick={() => go(index === 0 ? null : index - 1)} className="rounded-xl border border-line bg-white text-sm font-bold">{index === 0 ? '사진 목록' : '이전 사진'}</button>
            {index < photos.length - 1
              ? <button type="button" disabled={locked} onClick={() => go(index + 1)} className="resident-primary">다음 사진</button>
              : <button type="button" disabled={locked} onClick={submit} className="resident-primary">{busy ? '보내는 중…' : `제보 보내기 · ${photos.length}장`}</button>}
          </div>
        </> : <button type="button" disabled={locked || !photos.length} onClick={() => go(0)} className="resident-primary">
          {photos.length ? `사진 ${photos.length}장 확인하기` : '사진 확인하기'}
        </button>}
      </div>
    </section>
  )
}
