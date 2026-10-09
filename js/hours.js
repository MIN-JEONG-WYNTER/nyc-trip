// OSM opening_hours 문자열의 자주 쓰이는 형태만 해석한다.
// (예: "Mo-Fr 11:00-22:00; Sa,Su 10:00-23:00", "24/7", "Tu-Su 12:00-15:00,17:00-02:00; Mo off")
// 해석할 수 없으면 null을 돌려주고, 호출 쪽에서 카테고리 기본값을 쓴다.

const DAY_CODES = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const DAY_KO = ["월", "화", "수", "목", "금", "토", "일"];

export const toMin = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim());
  return m ? +m[1] * 60 + +m[2] : null;
};

export const fmtMin = (min) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

function parseDays(sel) {
  const days = new Set();
  for (const part of sel.split(",")) {
    const p = part.trim();
    if (!p) continue;
    const range = /^([A-Z][a-z])\s*-\s*([A-Z][a-z])$/.exec(p);
    if (range) {
      let a = DAY_CODES.indexOf(range[1]);
      const b = DAY_CODES.indexOf(range[2]);
      if (a < 0 || b < 0) return null;
      for (let i = 0; i < 7; i++) {
        days.add(a);
        if (a === b) break;
        a = (a + 1) % 7;
      }
      continue;
    }
    const single = DAY_CODES.indexOf(p.replace(/\[.*\]$/, ""));
    if (single < 0 || /\[/.test(p)) return null; // "Su[1]" 같은 표현은 지원하지 않음
    days.add(single);
  }
  return days.size ? [...days] : null;
}

// 시각 검사: 분은 59까지, 시는 23까지(끝 시각만 24:00 허용). 범위를 벗어나면 null
function clock(hhmm, isEnd) {
  const t = toMin(hhmm);
  if (t == null || +hhmm.split(":")[1] > 59 || t > (isEnd ? 1440 : 1439)) return null;
  return t;
}

function parseTimes(str) {
  const out = [];
  for (const part of str.split(",")) {
    const open = /^(\d{1,2}:\d{2})\+$/.exec(part.trim());
    if (open) {
      const o = clock(open[1], false);
      if (o == null) return null;
      out.push([o, o + 180]); // "18:00+" (끝 시간 미정) → 넉넉히 3시간으로 본다
      continue;
    }
    const m = /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/.exec(part.trim());
    if (!m) return null;
    const o = clock(m[1], false);
    let c = clock(m[2], true);
    if (o == null || c == null) return null;
    if (c <= o) c += 1440; // 자정을 넘기는 영업
    out.push([o, c]);
  }
  return out;
}

// 반환값: 요일(0=월 … 6=일)마다 [열기, 닫기] 분 단위 구간 배열, 또는 null
export function parseHours(raw) {
  if (!raw || typeof raw !== "string") return null;
  const text = raw
    .replace(/"[^"]*"/g, "")
    .replace(/\|\|/g, ";")
    // "Mo-Sa 09:00-18:00, Su 12:00-19:00", "Mo 18:00+, Tu …", "Su 11:00-18:00, PH off" → 규칙 구분자로
    .replace(/(\d|\+|\b[Oo]ff|\b[Cc]losed)\s*,\s*(?=(?:Mo|Tu|We|Th|Fr|Sa|Su|PH|SH)\b)/g, "$1;")
    .trim();
  if (!text) return null;
  const week = Array.from({ length: 7 }, () => null);
  let opened = false; // 영업 구간이 하나라도 있었는지 ("PH off"만 있는 문자열은 해석 불가로 본다)

  for (let rule of text.split(";")) {
    rule = rule.replace(/,\s*PH\b|\bPH\s*,/g, "").trim();
    if (!rule) continue;
    if (rule === "24/7") {
      for (let d = 0; d < 7; d++) week[d] = [[0, 1440]];
      opened = true;
      continue;
    }
    // 공휴일·특정 월·주차 규칙은 여행 기간 판단에 필요 없으므로 건너뛴다
    if (/^(PH|SH)\b/.test(rule) || /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|week|\d{4})\b/.test(rule)) continue;

    const m = /^((?:[A-Z][a-z](?:\s*-\s*[A-Z][a-z])?\s*,?\s*)+)?\s*(.*)$/.exec(rule);
    const daySel = m[1] ? m[1].replace(/,\s*$/, "") : null;
    const rest = m[2].trim();
    const days = daySel ? parseDays(daySel) : [0, 1, 2, 3, 4, 5, 6];
    if (!days) return null;

    if (/^(off|closed)$/i.test(rest)) {
      days.forEach((d) => (week[d] = []));
      continue;
    }
    const times = rest === "" ? null : parseTimes(rest);
    if (!times) return null;
    days.forEach((d) => (week[d] = times));
    opened = true;
  }
  if (!opened) return null;
  return week.map((w) => w || []);
}

export function describeHours(week) {
  if (!week) return "";
  const groups = [];
  week.forEach((iv, d) => {
    const key = !iv.length ? "휴무" : iv[0][0] === 0 && iv[0][1] >= 1440 ? "24시간" : iv.map(([o, c]) => `${fmtMin(o)}–${fmtMin(c)}`).join(", ");
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.to = d;
    else groups.push({ key, from: d, to: d });
  });
  return groups
    .map((g) => `${g.from === g.to ? DAY_KO[g.from] : `${DAY_KO[g.from]}–${DAY_KO[g.to]}`} ${g.key}`)
    .join(" · ");
}

// JS Date.getDay()(0=일) → 0=월 기준
export const weekdayOf = (date) => (date.getDay() + 6) % 7;
