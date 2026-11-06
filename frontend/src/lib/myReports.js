// 로그인이 없으므로 '내 제보'는 이 브라우저에 저장한 public_id 목록으로 찾는다.
// 브라우저 저장소는 막혀 있을 수 있어(사생활 보호 모드 등) 모든 읽기·쓰기를 try/catch 한다.
const IDS = 'sbgap.myReportIds'
const SEEN = 'sbgap.myReportsSeenAt' // 내 제보 화면을 마지막으로 본 시각 → 이후 소식이 있으면 빨간 점
const NICK = 'sbgap.nickname' // 별명. 처음 들어오면 자동으로 정해지고, 이 브라우저에 저장해 제보를 보낼 때 함께 보낸다
const NICK_AUTO = 'sbgap.nicknameAuto' // true면 자동으로 정해진 별명(직접 정하기 1번 가능). 직접 정하면 false가 되어 고정
const CLIENT = 'sbgap.clientKey' // 이 브라우저를 구분하는 무작위 값 (로그인이 없어 '한 브라우저당 한 표'를 서버에 알리는 데 씀)
const VOTES = 'sbgap.feedbackVotes' // 조치 완료 제보에 내가 누른 '고쳐졌어요 / 아직 그대로예요'
let memoryKey = null // 브라우저 저장소가 막혀 있어도 이번 방문 동안은 같은 값을 쓴다
const CONFIRMED = 'sbgap.confirmedIds' // 이 브라우저에서 '나도 봤어요'를 누른 제보 (중복 방지, 로그인이 없어 브라우저 기준)

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* 저장 불가: 이번 방문 동안만 유지 */ }
  window.dispatchEvent(new Event('sbgap-my-reports'))
}

// 제보 작성 중 글(메모, 시설 종류, 사진 메모)을 임시로 저장한다. 앱이 꺼지거나 화면이 다시 열려도 날아가지 않게.
// 사진은 저장하지 않는다(서버에 올라간 사진은 다시 고르면 됨). 글을 쓸 때마다 부르므로 하단바 갱신 이벤트는 보내지 않는다.
const DRAFT = 'sbgap.reportDraft'
const DRAFT_TTL_MS = 24 * 3600 * 1000 // 하루가 지난 임시저장은 버린다

// 자동 별명: '형용사 + 동물 + 숫자 4자리' (예: 푸른다람쥐4821). 식별값에서 만들어 같은 브라우저는 늘 같은 별명을 받고, 실명·연락처가 들어갈 일이 없다.
const ADJ = ['푸른', '따뜻한', '씩씩한', '조용한', '부지런한', '든든한', '느긋한', '반짝이는', '용감한', '다정한']
const ANIMAL = ['다람쥐', '부엉이', '참새', '고양이', '수달', '너구리', '거북이', '오리', '토끼', '고래']
function autoNick(key) {
  let h = 5381
  for (let i = 0; i < key.length; i += 1) h = ((h * 33) ^ key.charCodeAt(i)) >>> 0
  return `${ADJ[h % ADJ.length]}${ANIMAL[Math.floor(h / 10) % ANIMAL.length]}${String(h % 10000).padStart(4, '0')}`
}

export const myReports = {
  draft: () => {
    const d = read(DRAFT, null)
    return d && Date.now() - d.at < DRAFT_TTL_MS ? d : null
  },
  saveDraft: (d) => {
    try {
      if (!(d.photos?.length) && (!d.facility || d.facility === 'unknown')) localStorage.removeItem(DRAFT)
      else localStorage.setItem(DRAFT, JSON.stringify({ ...d, at: Date.now() }))
    } catch { /* 저장 불가 */ }
  },
  clearDraft: () => { try { localStorage.removeItem(DRAFT) } catch { /* 무시 */ } },
  clientKey: () => {
    let k = read(CLIENT, null)
    if (!k) {
      k = memoryKey ?? (globalThis.crypto?.randomUUID?.() ?? `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`)
      memoryKey = k
      write(CLIENT, k)
    }
    return k
  },
  nickname: () => read(NICK, ''),
  nicknameIsAuto: () => !!read(NICK_AUTO, false),
  // 앱을 처음 열 때(QR 스캔 직후) 별명이 없으면 자동으로 정해 준다. 이미 직접 정한 별명이 있는 브라우저는 그대로 고정이다.
  ensureNickname: () => {
    if (read(NICK, '')) return
    write(NICK, autoNick(myReports.clientKey()))
    write(NICK_AUTO, true)
  },
  // 자동 별명일 때만 직접 정할 수 있고(1번), 정하면 고정된다. 바꿨으면 true. 브라우저에 저장돼 앱을 껐다 켜도 유지(브라우저 데이터를 지우면 새로 정해짐)
  setNickname: (v) => {
    const name = String(v).trim().slice(0, 20)
    if (!name || !read(NICK_AUTO, false)) return false
    write(NICK, name)
    write(NICK_AUTO, false)
    return true
  },
  clientCode: () => myReports.clientKey().slice(0, 8), // 본인과 담당자가 서로 맞춰 볼 수 있는 앞 8자리
  vote: (publicId) => read(VOTES, {})[publicId] ?? null,
  setVote: (publicId, kind) => write(VOTES, { ...read(VOTES, {}), [publicId]: kind }),
  ids: () => read(IDS, []),
  remove: (publicId) => write(IDS, read(IDS, []).filter((x) => x !== publicId)),
  add: (publicId) => write(IDS, [publicId, ...read(IDS, []).filter((x) => x !== publicId)].slice(0, 50)),
  seenAt: () => read(SEEN, null),
  markSeen: () => write(SEEN, new Date().toISOString()),
  confirmed: (publicId) => read(CONFIRMED, []).includes(publicId),
  markConfirmed: (publicId) => write(CONFIRMED, [...read(CONFIRMED, []), publicId].slice(-200)),
  hasNews: (reports) => {
    const seen = read(SEEN, null)
    return reports.some((r) => !seen || new Date(r.news_at) > new Date(seen))
  },
}
