import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import AIResultCard from '../components/AIResultCard.jsx'
import PinPicker from '../components/PinPicker.jsx'
import { api } from '../lib/api.js'
import { currentPosition, resizeImage } from '../lib/image.js'
import { myReports } from '../lib/myReports.js'

// 주민 2 제보: 1 사진 → 2 위치(자동 + 핀 조정) → 3 확인(AI 결과, 시설 종류, 메모) → 보내기
// 동작 확인용 화면. 모양은 와이어프레임 기준으로 다시 그리되, 데이터 흐름(아래 함수들)은 그대로 쓰면 됨.
// 시설 종류로 담당 부서가 정해진다 (서버 규칙, docs/departments.md). 모르면 '모름' → 안전점검 총괄 부서
// 체험용 사진: frontend/public/demo/sample.jpg (직접 찍은 사진만. AI-Hub 사진은 약관상 넣으면 안 됨)
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    currentPosition().then((p) => {
      if (p) { setPos(p); setLocState('auto') } else setLocState('failed')
    })
    api.meta().then((m) => setFacilityTypes(m.facility_types)).catch(() => {})
  }, [])

  async function handleFile(file) {
    setError(''); setBusy(true); setPhoto(null)
    try {
      const blob = await resizeImage(file)
      setPreview(URL.createObjectURL(blob))
      setPhoto(await api.uploadPhoto(blob))
    } catch (e) { setError(`사진 처리 실패: ${e.message}`) } finally { setBusy(false) }
  }

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

  return (
    <section className="flex flex-col gap-4 p-5">
      <h1 className="text-xl font-bold">제보하기 {isDemo && <span className="text-sm text-amber-600">(체험)</span>}</h1>
      <p className="text-xs text-gray-500">얼굴·차량 번호판이 나오지 않게 찍어 주세요. 사진 속 위치 정보(EXIF)는 지우고 저장합니다.</p>

      <div>
        <h2 className="font-semibold">1. 사진</h2>
        {preview && <img src={preview} alt="제보 사진" className="mt-2 w-full rounded-lg" />}
        {isDemo
          ? <button type="button" onClick={useDemoPhoto} className="mt-2 w-full rounded-lg border py-3">체험용 사진 불러오기</button>
          : <input type="file" accept="image/*" capture="environment" className="mt-2 block w-full"
              onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])} />}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="font-semibold">2. 위치</h2>
        <PinPicker value={pos} onChange={(p) => { setPos(p); setLocState('manual') }} />
        <p className="text-sm text-gray-600">{locText}</p>
        {pos && <p className="text-xs text-gray-400">{pos.lat.toFixed(5)}, {pos.lon.toFixed(5)}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="font-semibold">3. 확인</h2>
        {busy && !photo && <p className="text-sm">AI가 사진을 보는 중…</p>}
        {photo && <AIResultCard ai={photo.ai} />}
        <div>
          <p className="mb-1 text-sm text-gray-600">어떤 시설인가요? (담당 부서를 정하는 데 씁니다)</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(facilityTypes).map(([code, label]) => (
              <button key={code} type="button" onClick={() => setFacility(code)}
                className={`rounded-full border px-3 py-1 text-sm ${facility === code ? 'border-brand bg-brand text-white' : 'bg-white'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <input value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={200}
          placeholder="한 줄 메모 (선택)" className="w-full rounded-lg border p-2" />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      <button type="button" disabled={!photo || busy} onClick={submit}
        className="rounded-lg bg-brand py-3 font-semibold text-white disabled:opacity-40">제보 보내기</button>
    </section>
  )
}
