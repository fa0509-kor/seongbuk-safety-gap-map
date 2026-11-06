// 사진 촬영 일시. JPEG의 EXIF(DateTimeOriginal)를 읽고, 없으면(HEIC·스크린샷 등) 파일 수정 시각을 쓴다.
// 서버는 사진 속 위치 정보(EXIF GPS)를 지우고 저장한다. 촬영 일시는 담당자에게 필요해서 이 값만 따로 보낸다.
export async function takenAt(file) {
  try {
    const v = new DataView(await file.slice(0, 131072).arrayBuffer())
    if (v.getUint16(0) === 0xffd8) {
      let off = 2
      while (off + 4 < v.byteLength) {
        const marker = v.getUint16(off)
        const len = v.getUint16(off + 2)
        if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) { // APP1 'Exif'
          const t = off + 10
          const le = v.getUint16(t) === 0x4949
          const u16 = (o) => v.getUint16(t + o, le)
          const u32 = (o) => v.getUint32(t + o, le)
          const find = (ifd, tag) => {
            const n = u16(ifd)
            for (let i = 0; i < n; i += 1) {
              const e = ifd + 2 + i * 12
              if (u16(e) === tag) return { count: u32(e + 4), val: u32(e + 8) }
            }
            return null
          }
          const sub = find(u32(4), 0x8769) // Exif 하위 목록
          const ent = sub && (find(sub.val, 0x9003) || find(sub.val, 0x9004)) // 촬영 / 디지털화 일시
          if (ent) {
            let s = ''
            for (let i = 0; i < Math.min(ent.count, 20); i += 1) s += String.fromCharCode(v.getUint8(t + ent.val + i))
            const m = s.match(/(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/)
            if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).toISOString() // 폰의 현지 시각
          }
        }
        if (marker === 0xffda) break
        off += 2 + len
      }
    }
  } catch { /* 읽을 수 없으면 아래 값을 쓴다 */ }
  return file.lastModified ? new Date(file.lastModified).toISOString() : null
}

// 화면에 보이는 모양: 11월 6일 오후 2:03
export function formatTaken(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
