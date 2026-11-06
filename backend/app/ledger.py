"""점검 대장(엑셀) 만들기. 관리자 목록을 그대로 .xlsx 한 장으로 내려받는다.

추가 패키지 없이 표준 라이브러리(zipfile)로 최소 xlsx를 만든다 (requirements.txt를 건드리지 않기 위해).
사진·주민 개인 정보는 넣지 않는다. 표에 들어가는 것은 접수 번호, 시각, 분류, 위치, 담당 부서, 처리 상태, 기한 같은 점검 기록뿐이다.
"""
from __future__ import annotations

import io
import zipfile
from datetime import datetime
from xml.sax.saxutils import escape

from .constants import KST

HEADERS = ["접수번호", "접수일시", "출처", "유형·규칙", "AI 신뢰도(%)", "담당 부서", "위치(주소)", "위도", "경도",
           "우선순위 점수", "처리 상태", "조치 기한", "기한 초과", "완료일시", "담당자 메모", "주민 확인(명)", "교차확인", "오탐", "촬영 일시", "사진 수"]


def _kst(dt: datetime | None) -> str:
    return dt.astimezone(KST).strftime("%Y-%m-%d %H:%M") if dt else ""


def rows_from(reports: list[dict]) -> list[list]:
    """serialize.report(admin=True) 결과를 대장 한 줄씩으로 바꾼다."""
    out = []
    for r in reports:
        done = next((h["at"] for h in r["history"] if h["to_status"] == "done"), None) if r["status"] == "done" else None
        notes = " / ".join(h["note"] for h in r["history"] if h["note"] and h["from_status"] is not None)
        gap = r["source"] == "gap"
        out.append([
            r["public_id"], _kst(r["created_at"]), r["source_label"],
            (r["gap_rule"] if gap else (r["ai"] or {}).get("category") or ""),
            "" if gap else (r["ai"] or {}).get("confidence"),
            r["dept"] or "", r["address"] or "", r["lat"], r["lon"],
            r["priority"]["total"], r["status_label"], _kst(r["priority"]["due_at"]),
            "예" if r["priority"]["overdue"] else "", _kst(done), notes,
            r["confirm_count"], "예" if r["cross_checked"] else "", "오탐" if r["false_positive"] else "",
            _kst(next((p["taken_at"] for p in r.get("photos", []) if p["position"] == 0 and p["taken_at"]), None)),
            len(r.get("photos", [])) or "",
        ])
    return out


def _col(i: int) -> str:
    s = ""
    i += 1
    while i:
        i, rem = divmod(i - 1, 26)
        s = chr(65 + rem) + s
    return s


def _cell(ref: str, v, style: int = 0) -> str:
    if v is None or v == "":
        return f'<c r="{ref}" s="{style}"/>'
    if isinstance(v, bool):
        v = "예" if v else ""
    if isinstance(v, (int, float)):
        return f'<c r="{ref}" s="{style}"><v>{v}</v></c>'
    return f'<c r="{ref}" s="{style}" t="inlineStr"><is><t xml:space="preserve">{escape(str(v))}</t></is></c>'


def to_xlsx(rows: list[list], title: str = "점검 대장") -> bytes:
    widths = [14, 17, 10, 20, 12, 18, 38, 10, 10, 12, 10, 17, 10, 17, 40, 12, 10, 8]
    sheet = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
             '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
             '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>',
             "<cols>" + "".join(f'<col min="{i + 1}" max="{i + 1}" width="{w}" customWidth="1"/>' for i, w in enumerate(widths)) + "</cols>",
             "<sheetData>"]
    for n, line in enumerate([HEADERS] + rows, start=1):
        cells = "".join(_cell(f"{_col(i)}{n}", v, 1 if n == 1 else 0) for i, v in enumerate(line))
        sheet.append(f'<row r="{n}">{cells}</row>')
    sheet.append(f'</sheetData><autoFilter ref="A1:{_col(len(HEADERS) - 1)}{len(rows) + 1}"/></worksheet>')
    styles = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
              '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
              '<fonts count="2"><font><sz val="11"/><name val="맑은 고딕"/></font><font><b/><sz val="11"/><name val="맑은 고딕"/></font></fonts>'
              '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
              '<fill><patternFill patternType="solid"><fgColor rgb="FFE5E7EB"/></patternFill></fill></fills>'
              '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
              '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
              '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
              '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>'
              '</styleSheet>')
    files = {
        "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
        "_rels/.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
        "xl/workbook.xml": f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="{escape(title)}" sheetId="1" r:id="rId1"/></sheets></workbook>',
        "xl/_rels/workbook.xml.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
        "xl/styles.xml": styles,
        "xl/worksheets/sheet1.xml": "".join(sheet),
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in files.items():
            z.writestr(name, data)
    return buf.getvalue()
