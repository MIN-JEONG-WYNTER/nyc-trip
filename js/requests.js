// "첫째날은 소호에서 쇼핑하고 싶어" 같은 문장 요청을 일정 조건으로 바꾼다 (규칙 기반, 외부 API 없음).
// 문장을 쉼표·마침표·"그리고"로 나눈 뒤 각 부분에서 날짜, 시간대, 동네, 종류·메뉴, 장소 이름, 부정/강조 표현을 찾는다.
import { CUISINES, kindOf } from "./categories.js";
import { distanceKm } from "./geo.js";
import { weekdayOf } from "./hours.js";
import { tripDate } from "./optimizer.js";

// 동네: 중심 좌표와 반경(km)
export const AREAS = {
  soho: { label: "소호", words: ["소호", "soho"], c: [40.7233, -74.001], r: 0.55 },
  noho: { label: "노호", words: ["노호", "noho"], c: [40.728, -73.9925], r: 0.4 },
  nolita: { label: "놀리타", words: ["놀리타", "nolita", "리틀이태리", "little italy"], c: [40.722, -73.9965], r: 0.4 },
  les: { label: "로어이스트사이드", words: ["로어이스트", "lower east", "les"], c: [40.718, -73.987], r: 0.6 },
  eastvillage: { label: "이스트빌리지", words: ["이스트빌리지", "이스트 빌리지", "east village"], c: [40.7265, -73.984], r: 0.6 },
  westvillage: { label: "웨스트빌리지", words: ["웨스트빌리지", "웨스트 빌리지", "west village", "그리니치", "greenwich"], c: [40.734, -74.003], r: 0.65 },
  chelsea: { label: "첼시", words: ["첼시", "chelsea", "미트패킹", "meatpacking", "하이라인", "high line"], c: [40.744, -74.003], r: 0.75 },
  flatiron: { label: "플랫아이언", words: ["플랫아이언", "flatiron", "유니언스퀘어", "union square", "노매드", "nomad"], c: [40.7405, -73.9895], r: 0.6 },
  ktown: { label: "코리아타운", words: ["코리아타운", "한인타운", "k타운", "ktown", "koreatown"], c: [40.7475, -73.9865], r: 0.3 },
  midtown: { label: "미드타운", words: ["미드타운", "midtown", "타임스퀘어", "타임스 스퀘어", "times square", "록펠러", "그랜드센트럴", "5번가", "피프스"], c: [40.756, -73.982], r: 1.3 },
  uws: { label: "어퍼웨스트", words: ["어퍼웨스트", "어퍼 웨스트", "upper west"], c: [40.787, -73.9754], r: 1.1 },
  ues: { label: "어퍼이스트", words: ["어퍼이스트", "어퍼 이스트", "upper east"], c: [40.7736, -73.9566], r: 1.1 },
  centralpark: { label: "센트럴파크", words: ["센트럴파크", "센트럴 파크", "central park"], c: [40.7812, -73.9665], r: 1.6 },
  downtown: { label: "다운타운", words: ["다운타운", "로어맨해튼", "로어 맨해튼", "월스트리트", "월가", "fidi", "downtown", "트라이베카", "tribeca"], c: [40.7105, -74.0095], r: 0.9 },
  dumbo: { label: "덤보", words: ["덤보", "dumbo"], c: [40.7033, -73.9881], r: 0.5 },
  williamsburg: { label: "윌리엄스버그", words: ["윌리엄스버그", "williamsburg", "그린포인트", "greenpoint"], c: [40.718, -73.955], r: 1.4 },
  brooklyn: { label: "브루클린", words: ["브루클린", "brooklyn"], c: [40.69, -73.97], r: 4.5 },
};

// 종류 (장소 종류 또는 태그)
const KINDS = [
  { label: "빈티지", tag: "vintage", words: ["빈티지", "vintage", "중고", "thrift", "스리프트"] },
  { label: "편집샵", tag: "select", words: ["편집샵", "편집 샵", "셀렉트샵", "스트릿", "streetwear"] },
  { label: "쇼핑", cats: ["shop"], words: ["쇼핑", "샵", "옷", "shopping", "가게"] },
  { label: "맛집", cats: ["restaurant"], words: ["맛집", "식당", "밥", "먹"] },
  { label: "카페·디저트", cats: ["cafe"], words: ["카페", "커피", "디저트", "베이커리", "빵"] },
  { label: "바·루프탑", cats: ["bar"], words: ["루프탑", "술", "칵테일", "바에", "바 ", "야경"] },
  { label: "박물관·미술관", cats: ["museum"], words: ["박물관", "미술관", "뮤지엄", "museum"] },
  { label: "구경·산책", cats: ["sight"], words: ["구경", "산책", "관광", "전망대"] },
  { label: "공연", cats: ["show"], words: ["공연", "뮤지컬", "재즈"] },
];
const CUISINE_WORDS = {
  steak: ["스테이크", "steak"],
  pizza: ["피자", "pizza"],
  burger: ["버거", "햄버거", "burger"],
  korean: ["한식", "한국음식", "한국 음식", "korean"],
  barbecue: ["바비큐", "bbq", "barbecue"],
  japanese: ["스시", "초밥", "일식", "sushi"],
  ramen: ["라멘", "누들", "ramen"],
  mexican: ["타코", "멕시칸", "taco"],
  sandwich: ["베이글", "델리", "샌드위치", "bagel", "deli"],
  chinese: ["중식", "딤섬", "dim sum"],
  brunch: ["브런치", "brunch"],
};
// 한글로 부를 만한 장소 별칭 → 장소 이름에 들어 있는 단어
const ALIASES = {
  모마: "moma", 메트: "metropolitan", 메트로폴리탄: "metropolitan", 자연사박물관: "natural history", 첼시마켓: "chelsea market",
  피터루거: "peter luger", 킨스: "keens", 벤자민: "benjamin", 누비아니: "nubiani", 누벨루즈: "nubeluz", 서밋: "summit", 써밋: "summit",
  자유의여신상: "statue of liberty", 여신상: "statue of liberty", 시카고: "chicago", 버드랜드: "birdland", 카츠: "katz", 레비앙: "levain",
  르뱅: "levain", 매그놀리아: "magnolia", 키스: "kith", 슈프림: "supreme", 스투시: "stüssy", 세포라: "sephora", 룰루레몬: "lululemon",
  알로: "alo", 스킴스: "skims", 글로시에: "glossier", 빅토리아시크릿: "victoria", 센츄리21: "century 21", 센추리21: "century 21",
  스타벅스: "starbucks", 리저브: "starbucks reserve", 오큘러스: "oculus", 덤보: "dumbo", 레온: "leon's bagels", 리온: "leon's bagels",
};

const PARTS = {
  morning: { label: "오전", words: ["오전", "아침"], win: [7 * 60, 12 * 60] },
  lunch: { label: "점심", words: ["점심"], win: [11 * 60, 15 * 60] },
  afternoon: { label: "오후", words: ["오후", "낮"], win: [12 * 60, 18 * 60] },
  evening: { label: "저녁", words: ["저녁", "밤", "야경"], win: [17 * 60, 24 * 60] },
};

const ORDINALS = [
  [/(첫|1)\s*(번째|째)?\s*날|1\s*일\s*차|day\s*1|첫날/i, 0],
  [/(둘|두|2)\s*(번째|째)\s*날|2\s*일\s*차|day\s*2|둘째날|이튿날/i, 1],
  [/(셋|세|3)\s*(번째|째)\s*날|3\s*일\s*차|day\s*3|셋째날/i, 2],
  [/(넷|네|4)\s*(번째|째)\s*날|4\s*일\s*차|day\s*4|넷째날/i, 3],
];
const WEEKDAYS = { 월요일: 0, 화요일: 1, 수요일: 2, 목요일: 3, 금요일: 4, 토요일: 5, 일요일: 6 };

function findDay(text, meta) {
  const n = meta.days.length;
  if (/마지막\s*날|last day/i.test(text)) return n - 1;
  for (const [re, d] of ORDINALS) if (re.test(text) && d < n) return d;
  const md = /(\d{1,2})\s*[\/월]\s*(\d{1,2})\s*일?/.exec(text) || /(?:^|\D)(\d{1,2})\s*일(?!\s*차)/.exec(text);
  for (let d = 0; d < n; d++) {
    const date = tripDate(meta, d);
    if (md && md.length === 3 && +md[1] === date.getMonth() + 1 && +md[2] === date.getDate()) return d;
    if (md && md.length === 2 && +md[1] === date.getDate()) return d;
    for (const [w, wd] of Object.entries(WEEKDAYS)) if (text.includes(w) && weekdayOf(date) === wd) return d;
  }
  return null;
}

const has = (text, words) => words.some((w) => text.includes(w));

function findPlaces(text, places) {
  const lower = text.toLowerCase();
  const found = new Set();
  for (const [ko, en] of Object.entries(ALIASES)) {
    if (!text.replace(/\s/g, "").includes(ko)) continue;
    for (const p of places) if (p.name.toLowerCase().includes(en)) found.add(p.id);
  }
  for (const p of places) {
    const key = p.name.toLowerCase().split(/[·(\-–]/)[0].trim();
    if (key.length >= 4 && lower.includes(key)) found.add(p.id);
  }
  return [...found];
}

// 장소가 조건(동네·종류·메뉴)에 맞는지
export function matchesPlace(p, cond, loc = p) {
  if (cond.area) {
    const a = AREAS[cond.area];
    if (distanceKm(loc, { lat: a.c[0], lon: a.c[1] }) > a.r) return false;
  }
  if (cond.kind) {
    const k = KINDS.find((x) => x.label === cond.kind);
    if (k.tag ? !(p.tags || []).includes(k.tag) : !k.cats.includes(p.category)) return false;
  }
  if (cond.cuisine && !(p.category === "restaurant" && p.cuisine === cond.cuisine)) return false;
  return true;
}

// 문장 하나 → 규칙 목록
export function parseRequest(text, trip) {
  const places = trip.places.filter((p) => !p.deleted);
  const rules = [];
  const clauses = text
    .split(/[,.\n;!?]|그리고|그 다음|다음에|하고\s/)
    .map((c) => c.trim())
    .filter(Boolean);
  let lastDay = null;
  for (const clause of clauses) {
    const lower = clause.toLowerCase();
    let day = findDay(clause, trip.meta);
    if (day == null) day = lastDay;
    else lastDay = day;
    const part = Object.keys(PARTS).find((k) => has(lower, PARTS[k].words)) || null;
    const negative = /빼|제외|안\s*가|말고|싫|취소|없이/.test(clause);
    const must = /꼭|무조건|반드시|필수/.test(clause);
    const ids = findPlaces(clause, places);

    if (ids.length) {
      if (negative) rules.push({ type: "exclude", ids, day });
      else if (day != null) rules.push({ type: "wish", day, part, ids, must });
      else rules.push({ type: "must", ids });
      continue;
    }
    const area = Object.keys(AREAS).find((k) => has(lower, AREAS[k].words)) || null;
    const kind = KINDS.find((k) => has(lower, k.words))?.label || null;
    const cuisine = Object.keys(CUISINE_WORDS).find((k) => has(lower, CUISINE_WORDS[k])) || null;
    if (!area && !kind && !cuisine) continue;
    const cond = { area, kind: cuisine ? null : kind, cuisine };
    rules.push({ type: negative ? "avoid" : "wish", day, part, cond, must });
  }
  return rules;
}

export function describeRule(rule, trip) {
  const name = (id) => trip.places.find((p) => p.id === id)?.name.split(/[·(]/)[0].trim() || "?";
  const bits = [];
  if (rule.day != null) bits.push(`DAY ${rule.day + 1}`);
  if (rule.part) bits.push(PARTS[rule.part].label);
  if (rule.ids) bits.push(rule.ids.map(name).join(", "));
  if (rule.cond?.area) bits.push(AREAS[rule.cond.area].label);
  if (rule.cond?.kind) bits.push(rule.cond.kind);
  if (rule.cond?.cuisine) bits.push(`${CUISINES[rule.cond.cuisine].icon} ${CUISINES[rule.cond.cuisine].label}`);
  const verb = { exclude: "빼기", avoid: "피하기", must: "꼭 가기", wish: rule.must ? "꼭" : "넣기" }[rule.type];
  return `${bits.join(" · ")} → ${verb}`;
}

// 요청 규칙을 반영한 일정 입력을 만든다.
// - exclude: 이번 일정에서 뺌 / must: 꼭 가기로 포함
// - wish: 조건에 맞는 곳을 (보류 중이어도) 후보로 넣고, 그날·그 시간대에 들어가면 보상, 하나도 없으면 비용
// - avoid: 그날 조건에 맞는 곳이 들어가면 비용
export function applyRequests(trip, requests) {
  const t = structuredClone(trip);
  const wishes = [];
  const live = t.places.filter((p) => !p.deleted);
  for (const req of requests || []) {
    for (const rule of parseRequest(req.text, trip)) {
      if (rule.type === "exclude") {
        for (const p of live) if (rule.ids.includes(p.id)) p.selected = false;
        continue;
      }
      const ids = rule.ids || live.filter((p) => matchesPlace(p, rule.cond) || (p.branches || []).some((b) => matchesPlace(p, rule.cond, b))).map((p) => p.id);
      if (rule.type === "must") {
        for (const p of live) if (ids.includes(p.id)) Object.assign(p, { selected: true, priority: "must" });
        continue;
      }
      if (rule.type === "wish") {
        for (const p of live) {
          if (!ids.includes(p.id)) continue;
          if (!p.selected) Object.assign(p, { selected: true, priority: "extra" }); // 요청 때문에 들어온 후보 — 못 넣어도 괜찮음
          if (rule.ids && rule.day != null) p.pin = { ...(p.pin || {}), day: rule.day };
        }
      }
      // 동네 조건이면 실제로 고른 지점(분점)이 그 동네에 있어야 인정
      const byId = Object.fromEntries(live.map((p) => [p.id, p]));
      const accept = rule.cond?.area
        ? (id, bi) => {
            const p = byId[id];
            const loc = bi ? p.branches[bi - 1] : p;
            return matchesPlace(p, { area: rule.cond.area }, loc);
          }
        : null;
      wishes.push({ ...rule, ids: new Set(ids), win: rule.part ? PARTS[rule.part].win : null, accept });
    }
  }
  return { trip: t, wishes };
}
