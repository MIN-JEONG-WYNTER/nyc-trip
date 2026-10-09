// "첫째날은 소호에서 쇼핑하고 싶어" 같은 문장 요청을 일정 조건으로 바꾼다 (규칙 기반, 외부 API 없음).
// 문장을 쉼표·마침표·"그리고"·날짜 표현 앞에서 나누고, "말고/대신" 앞부분은 부정으로 본다.
// 각 부분에서 날짜, 시간대, 동네, 종류·메뉴, 장소 이름, 부정/강조 표현, 귀가·출발 시각을 찾는다.
import { CUISINES } from "./categories.js";
import { distanceKm, travel } from "./geo.js";
import { weekdayOf, toMin } from "./hours.js";
import { tripDate } from "./optimizer.js";
import { AREAS, findArea } from "./areas.js";

export { AREAS };

// 요청 입력칸 아래 안내 문구 (이해하는 표현)
export const REQUEST_HINT =
  "날짜(첫째날·3일차·10/10·토요일·마지막날), 시간대(아침·점심·오후·저녁·밤), 동네(소호·첼시·덤보·브루클린…), " +
  "종류(빈티지·편집샵·쇼핑·맛집·카페·바·박물관·구경·공연), 메뉴(스테이크·피자·랍스터…), 장소 이름(모마·피터루거·메모리얼…), " +
  "‘근처’, ‘같은 날’, ‘하루에 몰아서’·‘첫째날이랑 셋째날에만’·‘매일’, ‘꼭’(필수)·‘빼줘/말고/안 갈래’(제외), " +
  "귀가·출발(일찍 귀가·10시까지 숙소·늦잠·9시에 출발), ‘여유롭게’·‘하루 3곳만’을 알아들어요. 안 지켜지면 ‘꼭’을 붙여보세요.";

// 종류 (장소 종류 또는 태그) — 더 구체적인 것부터 (처음 맞는 것을 쓴다)
const KINDS = [
  { label: "빈티지", tag: "vintage", words: ["빈티지", "vintage", "중고", "thrift", "스리프트"] },
  { label: "편집샵", tag: "select", words: ["편집샵", "편집 샵", "셀렉트샵", "스트릿", "streetwear"] },
  { label: "박물관·미술관", cats: ["museum"], words: ["박물관", "미술관", "뮤지엄", "museum", "전시"] },
  { label: "공연", cats: ["show"], words: ["공연", "뮤지컬", "재즈", "브로드웨이"] },
  { label: "바·루프탑", cats: ["bar"], words: ["루프탑", "술집", "술 마시", "술마시", "술 한잔", "술한잔", "와인바", "칵테일", "야경바", "바에서", "바에 ", "바 가", "펍"], re: /(^|\s)바(에서|에|로|도|는|를)?\s*$/ },
  { label: "카페·디저트", cats: ["cafe"], words: ["카페", "커피", "디저트", "베이커리", "빵", "케이크", "쿠키"] },
  { label: "맛집", cats: ["restaurant"], words: ["맛집", "식당", "밥"], weak: ["먹"] },
  { label: "구경·산책", cats: ["sight"], words: ["구경", "산책", "관광", "전망대", "야경"] },
  { label: "쇼핑", cats: ["shop"], words: ["쇼핑", "샵", "옷", "shopping", "가게"] },
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
  seafood: ["해산물", "랍스터", "랍스타", "로브스터", "굴", "lobster", "seafood"],
};
// 한글로 부를 만한 장소 별칭 → 장소 이름에 들어 있는 단어
const ALIASES = {
  모마: "moma", 메트: "metropolitan", 메트로폴리탄: "metropolitan", 자연사박물관: "natural history", 첼시마켓: "chelsea market",
  피터루거: "peter luger", 킨스: "keens", 벤자민: "benjamin", 누비아니: "nubiani", 누벨루즈: "nubeluz", 서밋: "summit", 써밋: "summit",
  자유의여신상: "statue of liberty", 여신상: "statue of liberty", 시카고: "chicago (ambassador", 러시: "러시 티켓", 러쉬: "러시 티켓", 버드랜드: "birdland", 카츠: "katz", 레비앙: "levain",
  르뱅: "levain", 매그놀리아: "magnolia", 키스: "kith", 슈프림: "supreme", 스투시: "stüssy", 세포라: "sephora", 룰루레몬: "lululemon",
  알로: "alo", 스킴스: "skims", 글로시에: "glossier", 빅토리아시크릿: "victoria", 센츄리21: "century 21", 센추리21: "century 21",
  스타벅스: "starbucks", 리저브: "starbucks reserve", 오큘러스: "oculus", 메모리얼: "9/11 memorial", "911": "9/11 memorial", 그라운드제로: "9/11 memorial", 덤보: "dumbo", 레온: "leon's bagels", 리온: "leon's bagels",
  루크스: "luke's lobster", 루크스랍스터: "luke's lobster",
};
// 별칭이 다른 말의 일부로 쓰인 경우 (메트로 타고, 키스 해링, 시카고 피자)
const ALIAS_BLOCK = [/^메트로(?!폴리탄)/, /^키스\s*해링/, /^시카고\s*(피자|스타일|딥)/];
// 이름 뒤에 붙어도 되는 조사
const PARTICLE = "(?:에서는|에서도|에서|이랑|하고|말고|까지|부터|으로|은|는|이|가|을|를|에|엔|도|랑|와|과|로|만|의|나|꼭|쯤|요)?";
const BOUND_L = "(?<![\\p{L}\\p{N}])";
const BOUND_R = "(?![\\p{L}\\p{N}])";
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// 긴 별칭(피터루거 등)은 글자 사이 띄어쓰기 허용 ("피터 루거")
const ALIAS_RE = Object.keys(ALIASES).map((ko) => [
  ko,
  new RegExp(BOUND_L + (ko.length >= 4 ? [...ko].map(reEsc).join("\\s?") : reEsc(ko)) + PARTICLE + BOUND_R, "gu"),
]);

const PARTS = {
  morning: { label: "오전", words: ["오전", "아침"], win: [7 * 60, 12 * 60] },
  lunch: { label: "점심", words: ["점심"], win: [11 * 60, 15 * 60] },
  afternoon: { label: "오후", words: ["오후", "낮"], win: [12 * 60, 18 * 60] },
  // "밤"은 저녁보다 늦게 (20시 이후 시작). 저녁보다 먼저 찾는다
  night: { label: "밤", words: ["밤", "야경", "늦은 저녁", "자기 전"], win: [20 * 60, 26 * 60] },
  evening: { label: "저녁", words: ["저녁"], win: [17 * 60, 24 * 60] },
};

// 날짜 표현 (문장 나누기와 날짜 찾기에 같이 쓴다)
const KO_ORD = { 첫: 1, 둘: 2, 두: 2, 이튿: 2, 셋: 3, 세: 3, 넷: 4, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10 };
const DAY_SRC = [
  "마지막\\s*날|last\\s*day",
  `(${Object.keys(KO_ORD).join("|")})\\s*(?:번\\s*)?째\\s*날|(첫|이튿)\\s*날`,
  "(?<!\\d)(\\d{1,2})\\s*(?:번\\s*)?째\\s*날|(?<!\\d)(\\d{1,2})\\s*일\\s*차|day\\s*(\\d{1,2})(?!\\d)",
  "(?<![\\d/])(\\d{1,2})\\s*[\\/월]\\s*(\\d{1,2})(?!\\d)\\s*일?|(?<![\\d/])(\\d{1,2})\\s*일(?!\\s*차)",
  "([월화수목금토일])요일",
].join("|");
const DAY_RE = () => new RegExp(DAY_SRC, "gi");

function findDay(text, meta) {
  const n = meta.days.length;
  const m = DAY_RE().exec(text);
  if (!m) return null;
  let d = null;
  if (/^(마지막|last)/i.test(m[0])) d = n - 1;
  else if (m[1] || m[2]) d = KO_ORD[m[1] || m[2]] - 1;
  else if (m[3] || m[4] || m[5]) d = +(m[3] || m[4] || m[5]) - 1;
  else
    for (let i = 0; i < n; i++) {
      const date = tripDate(meta, i);
      if (m[6] && +m[6] === date.getMonth() + 1 && +m[7] === date.getDate()) d = i;
      else if (m[8] && +m[8] === date.getDate()) d = i;
      else if (m[9] && weekdayOf(date) === "월화수목금토일".indexOf(m[9])) d = i;
      if (d != null) break;
    }
  return d != null && d >= 0 && d < n ? d : null;
}

const has = (text, words) => words.some((w) => text.includes(w));

// 장소 이름 찾기 — 별칭/영문 이름이 단어로 쓰였을 때만 (조사는 붙어도 됨). [{ id, alias }]
function findPlaces(text, places) {
  const lower = text.toLowerCase();
  const found = new Map();
  for (const [ko, re] of ALIAS_RE) {
    re.lastIndex = 0;
    let m;
    let ok = false;
    while ((m = re.exec(text))) if (!ALIAS_BLOCK.some((b) => b.test(text.slice(m.index)))) ok = true;
    if (!ok) continue;
    for (const p of places) if (p.name.toLowerCase().includes(ALIASES[ko]) && !found.has(p.id)) found.set(p.id, ko);
  }
  for (const p of places) {
    const key = p.name.toLowerCase().split(/[·(\-–]/)[0].trim();
    if (key.length < 4 || found.has(p.id)) continue;
    const re = new RegExp(`(?<![a-z0-9])${reEsc(key).replace(/ /g, "\\s*")}(?![a-z0-9])`, "i");
    if (re.test(lower)) found.set(p.id, null);
  }
  return [...found].map(([id, alias]) => ({ id, alias }));
}

function findKind(lower) {
  const k = KINDS.find((x) => has(lower, x.words) || x.re?.test(lower.trim())) || KINDS.find((x) => x.weak && has(lower, x.weak));
  return k?.label || null;
}

// 장소가 조건(동네·종류·메뉴)에 맞는지
export function matchesPlace(p, cond, loc = p) {
  if (cond.area) {
    const a = AREAS[cond.area];
    const centers = a.centers || [a.c];
    if (!centers.some((c) => distanceKm(loc, { lat: c[0], lon: c[1] }) <= a.r)) return false;
  }
  if (cond.kind) {
    const k = KINDS.find((x) => x.label === cond.kind);
    if (k.tag ? !(p.tags || []).includes(k.tag) : !k.cats.includes(p.category)) return false;
  }
  if (cond.cuisine && !(p.category === "restaurant" && p.cuisine === cond.cuisine)) return false;
  return true;
}

// "10시", "오후 3시 반", "9시 30분" → 분. 시각 앞뒤 말로 오전/오후를 정한다.
const CLOCK = /(오전|오후|아침|저녁|밤|새벽)?\s*(\d{1,2})\s*시\s*(반|(\d{1,2})\s*분)?/;
function clockMin(m, guess) {
  let h = +m[2];
  const min = m[3] === "반" ? 30 : +(m[4] || 0);
  if (h > 24 || min > 59) return null;
  const am = /오전|아침|새벽/.test(m[1] || "");
  const pm = /오후|저녁|밤/.test(m[1] || "");
  if (h < 12) {
    if (pm) h += 12;
    else if (!am) h = guess(h);
  } else if (h === 12 && /밤/.test(m[1] || "")) h = 24;
  return h * 60 + min;
}
// 귀가 시각은 밤 기준: "12시까지" = 자정, "1시까지"·"새벽 2시" = 다음날 새벽 (오전·낮을 말하면 그대로)
function endClockMin(m) {
  const h = +m[2];
  const explicitDay = /오전|아침/.test(m[1] || "") || /낮/.test(m[0]);
  const v = clockMin(m, (x) => (x <= 5 ? x + 24 : x + 12));
  if (v == null) return null;
  if (h === 12 && !explicitDay) return 24 * 60 + (v % 60);
  if (/새벽/.test(m[1] || "") && h <= 6) return (h + 24) * 60 + (v % 60);
  return v;
}
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

// 귀가·출발·여유 표현 → 규칙
function timeRules(clause, day) {
  const out = [];
  const t = clause.replace(/\s+/g, " ");
  const home = "(귀가|들어가|들어오|숙소|호텔|복귀)";
  let m;
  if ((m = new RegExp(`${CLOCK.source}\\s*(까지|전에|이전에|전까지)\\s*(?:는|은)?\\s*${home}`).exec(t)) || (m = new RegExp(`${home}.{0,6}?${CLOCK.source}\\s*(까지|전)`).exec(t))) {
    const c = m[1] && /귀가|들어|숙소|호텔|복귀/.test(m[1]) ? m.slice(1) : m;
    const min = endClockMin(c);
    if (min != null) out.push({ type: "dayEnd", day, time: hhmm(min), mode: "set" });
  } else if (/(일찍|빨리)\s*(귀가|들어|숙소|호텔|복귀)/.test(t)) out.push({ type: "dayEnd", day, time: "20:00", mode: "min" });
  if ((m = new RegExp(`${CLOCK.source}\\s*(?:에|쯤|부터|에는)?\\s*(출발|나가|나서|시작)`).exec(t))) {
    const min = clockMin(m, (h) => (h <= 5 ? h + 12 : h));
    if (min != null) out.push({ type: "dayStart", day, time: hhmm(min), mode: "set" });
  } else if (/늦잠|늦게\s*(시작|나가|출발|일어)|느지막|천천히\s*(나가|출발|시작)/.test(t)) out.push({ type: "dayStart", day, time: "10:30", mode: "max" });
  // "하루에 3곳만", "그날은 두 군데 정도" → 그날(또는 매일) 장소 수
  const cnt = /(\d+|한|두|세|네|다섯|여섯)\s*(곳|군데)\s*(만|정도|까지|이하)?/.exec(t);
  if (cnt) out.push({ type: "maxPlaces", day, max: /\d/.test(cnt[1]) ? +cnt[1] : { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6 }[cnt[1]] });
  else if (/여유롭|여유 ?있게|느긋|널널/.test(t)) out.push({ type: "maxPlaces", day, max: 4 });
  return out;
}

// 부정 표현: "빼/제외/싫/…"와 "~지 않/~지 마"가 함께 있으면 서로 뒤집힘 ("빼고 싶지 않아"). "안 가본"은 부정이 아님
const NEG = /빼|제외|안\s*(?:가(?!\s*본|\s*봤)|갈|갑|감|할|해|하|함)|싫|취소|없이/;
const NOT = /[지진]\s*않|지\s*말|지\s*마/;

// 문장 → 부분 목록 { text, neg(말고 앞부분), link(다음 부분과 짝) }
function splitClauses(text) {
  const out = [];
  for (const chunk of text.split(/[,.\n;!?]|그리고|그 다음|다음에|하고\s/)) {
    const bits = chunk.split(/\s*(?:말고|대신에?)(?:\s|$)/);
    bits.forEach((b, i) => {
      // 날짜 표현이 두 번 나오면 두 번째부터 앞에서 나눈다 ("셋째날 소호 넷째날 첼시")
      const re = DAY_RE();
      const cuts = [];
      let m;
      let seen = false;
      while ((m = re.exec(b))) {
        if (seen && m.index > 0) cuts.push(m.index);
        seen = true;
      }
      const pieces = [0, ...cuts].map((s, j) => b.slice(s, cuts[j] ?? b.length).trim());
      pieces.forEach((p, j) => {
        const last = j === pieces.length - 1;
        if (p) out.push({ text: p, neg: i < bits.length - 1 && last, link: i < bits.length - 1 && last });
        else if (last && i < bits.length - 1 && out.length) Object.assign(out.at(-1), { neg: true, link: true });
      });
    });
  }
  return out;
}

// 문장 하나 → 규칙 목록
// "쇼핑은 하루에 몰아서", "박물관은 이틀에 나눠서" → 그 종류가 들어가는 날 수
const GROUP_DAYS = [
  [/(하루|한\s*날|(?<!\d)1\s*일)(?!\s*차)\s*(?:에만|에|만|동안)/, 1],
  [/(이틀|두\s*날|(?<!\d)2\s*일)(?!\s*차)\s*(?:에만|에|만|동안)/, 2],
  [/(사흘|세\s*날|(?<!\d)3\s*일)(?!\s*차)\s*(?:에만|에|만|동안)/, 3],
];

// 문장 전체에 걸친 종류 규칙: N일에 몰기 / 특정 날에만 / 매일
function groupRule(text, trip) {
  const lower = text.toLowerCase();
  if (findPlaces(text, trip.places.filter((p) => !p.deleted)).length) return null;
  const kind = findKind(lower);
  const cuisine = Object.keys(CUISINE_WORDS).find((k) => has(lower, CUISINE_WORDS[k])) || null;
  const area = findArea(lower);
  if (!kind && !cuisine) return null;
  const cond = { area, kind: cuisine ? null : kind, cuisine };
  const n = GROUP_DAYS.find(([re]) => re.test(text))?.[1];
  if (n && !/(\d+|한|두|세|네|다섯)\s*(곳|군데|개)/.test(text)) return { type: "groupDays", cond, maxDays: n }; // "하루에 두 곳"은 개수 얘기라 제외
  const clauses = splitClauses(text);
  const dated = clauses.filter((c) => findDay(c.text, trip.meta) != null);
  const days = [...new Set(dated.map((c) => findDay(c.text, trip.meta)))];
  // 날짜마다 다른 종류를 말했으면("첫째날 쇼핑 둘째날 박물관") 날짜별 요청이지 "그 날에만"이 아니다
  const condKey = (c) => findKind(c.text.toLowerCase()) || Object.keys(CUISINE_WORDS).find((k) => has(c.text.toLowerCase(), CUISINE_WORDS[k])) || null;
  const kinds = new Set(dated.map(condKey).filter(Boolean));
  if ((days.length >= 2 || (days.length === 1 && /날에만|날만/.test(text))) && !NEG.test(text) && !/말고|대신/.test(text) && kinds.size <= 1)
    return { type: "onlyDays", cond, days: days.sort((a, b) => a - b) };
  if (/매일|날마다/.test(text) && !/귀가|들어가|출발|늦잠|일찍/.test(text)) return { type: "everyDay", cond };
  return null;
}

export function parseRequest(text, trip) {
  text = String(text || "").replace(/쨋\s*날/g, "째날");
  const places = trip.places.filter((p) => !p.deleted);
  const g = groupRule(text, trip);
  if (g) return [g];
  const rules = [];
  const items = [];
  let lastDay = null;
  for (const c of splitClauses(text)) {
    const lower = c.text.toLowerCase();
    const ownDay = findDay(c.text, trip.meta);
    const day = ownDay ?? lastDay;
    if (ownDay != null) lastDay = ownDay;
    const part = Object.keys(PARTS).find((k) => has(lower, PARTS[k].words)) || null;
    const neg = c.neg || NEG.test(c.text) !== NOT.test(c.text);
    const must = /꼭|무조건|반드시|필수/.test(c.text);
    const times = timeRules(c.text, /매일|날마다/.test(c.text) ? null : day);
    let found = findPlaces(c.text, places);
    let area = findArea(lower);
    const kind = findKind(lower);
    const cuisine = Object.keys(CUISINE_WORDS).find((k) => has(lower, CUISINE_WORDS[k])) || null;
    // "덤보에서 피자"처럼 동네 이름이기도 한 별칭 + 종류·메뉴 → 동네 조건으로
    if (kind || cuisine) {
      const asArea = found.filter((f) => f.alias && Object.keys(AREAS).some((k) => AREAS[k].words.includes(f.alias)));
      if (asArea.length) {
        area = Object.keys(AREAS).find((k) => AREAS[k].words.includes(asArea[0].alias));
        found = found.filter((f) => !asArea.includes(f));
      }
    }
    const ids = found.map((f) => f.id);
    const cond = !ids.length && (area || kind || cuisine) ? { area, kind: cuisine ? null : kind, cuisine } : null;
    items.push({ ownDay, day, part, neg, must, ids, cond, link: c.link, times, near: /근방|근처|주변|일대/.test(c.text), kind });
  }
  // "A 말고 B": 한쪽에만 대상이 있으면 다른 쪽도 같은 대상 ("피터루거는 둘째날 말고 셋째날")
  items.forEach((it, i) => {
    const nx = items[i + 1];
    if (!it.link || !nx) return;
    const subj = (x) => x.ids.length || x.cond;
    if (subj(it) && !subj(nx)) Object.assign(nx, { ids: it.ids, cond: it.cond });
    else if (!subj(it) && subj(nx)) Object.assign(it, { ids: nx.ids, cond: nx.cond });
  });
  for (const it of items) {
    rules.push(...it.times);
    const { day, part, must, ids, cond } = it;
    if (ids.length) {
      if (it.neg) rules.push(it.ownDay != null ? { type: "avoid", day: it.ownDay, part, ids } : { type: "exclude", ids, day: null });
      else if (day != null || (part && !it.near)) rules.push({ type: "wish", day, part: it.near ? null : part, ids, must });
      else rules.push({ type: must ? "must" : "include", ids });
      // "메모리얼 및 근방 구경" → 그 장소 근처(800m)의 곳들도 같은 날에. "근처에서 점심" → 근처 식당
      if (it.near && !it.neg) {
        const kind = (part === "lunch" || part === "evening") && (!it.kind || /맛집/.test(it.kind)) ? "맛집" : it.kind && !/맛집/.test(it.kind) ? it.kind : null;
        rules.push({ type: "wish", day, part, near: ids, cond: kind ? { kind } : null, must: false });
      }
    } else if (cond) rules.push({ type: it.neg ? "avoid" : "wish", day, part, cond, must: it.neg ? false : must });
  }
  // "누비아니랑 자연사 박물관 같은 날" → 같은 날에 넣기
  if (/같은\s*날|한\s*날에|하루에\s*같이|같이\s*하루/.test(text)) {
    const ids = [...new Set(items.filter((x) => !x.neg).flatMap((x) => x.ids))];
    if (ids.length >= 2) rules.push({ type: "sameDay", ids });
  }
  return rules;
}

export function describeRule(rule, trip) {
  const name = (id) => trip.places.find((p) => p.id === id)?.name.split(/[·(]/)[0].trim() || "?";
  const when = rule.day != null ? `DAY ${rule.day + 1}` : "매일";
  if (rule.type === "dayEnd") return `${when} · ${rule.time}까지 귀가`;
  if (rule.type === "dayStart") return `${when} · ${rule.time} 이후 출발`;
  if (rule.type === "maxPlaces") return `${when} · ${rule.max}곳 정도로`;
  const condText = (c) =>
    [c.area && AREAS[c.area].label, c.kind, c.cuisine && `${CUISINES[c.cuisine].icon} ${CUISINES[c.cuisine].label}`].filter(Boolean).join(" · ");
  if (rule.type === "groupDays") return `${condText(rule.cond)} → ${rule.maxDays === 1 ? "하루에 몰기" : `${rule.maxDays}일 안에`}`;
  if (rule.type === "onlyDays") return `${condText(rule.cond)} → ${rule.days.map((d) => `DAY ${d + 1}`).join("·")}에만`;
  if (rule.type === "everyDay") return `${condText(rule.cond)} → 매일 넣기`;
  if (rule.type === "sameDay") return `${rule.ids.map(name).join(", ")} → 같은 날에`;
  if (rule.near) return `${rule.day != null ? `DAY ${rule.day + 1} · ` : ""}${rule.near.map(name).join(", ")} 근처${rule.cond?.kind ? ` · ${rule.cond.kind}` : ""} → 넣기`;
  const bits = [];
  if (rule.day != null) bits.push(`DAY ${rule.day + 1}`);
  if (rule.part) bits.push(PARTS[rule.part].label);
  if (rule.ids) bits.push(rule.ids.map(name).join(", "));
  if (rule.cond?.area) bits.push(AREAS[rule.cond.area].label);
  if (rule.cond?.kind) bits.push(rule.cond.kind);
  if (rule.cond?.cuisine) bits.push(`${CUISINES[rule.cond.cuisine].icon} ${CUISINES[rule.cond.cuisine].label}`);
  const verb = { exclude: "빼기", avoid: rule.day != null && rule.ids ? "이날은 빼기" : "피하기", must: "꼭 가기", include: "넣기", wish: rule.must ? "꼭" : "넣기" }[rule.type];
  return `${bits.join(" · ")} → ${verb}`;
}

// 하루 시작·끝 바꾸기 (그날 또는 매일). 끝은 시작+60분보다 이르지 않게, 첫날 체크인·마지막날 체크아웃은 넘지 않게
// 그날 시각이 정해진 꼭 가기·고정 일정들 [시작 분, 장소]
function fixedTimes(t, d) {
  const out = [];
  for (const p of t.places) {
    if (p.deleted || !p.selected) continue;
    const pinned = p.pin && (p.pin.day === d || p.pin.day == null) && toMin(p.pin.time) != null;
    if (pinned && (p.pin.day === d || p.priority === "must")) out.push([toMin(p.pin.time), p]);
    if (p.priority !== "must") continue;
    for (const sl of p.slots || []) if ((sl.day === d || (sl.day == null && (p.slots || []).length === 1)) && toMin(sl.time) != null) out.push([toMin(sl.time), p]);
  }
  return out;
}

function applyTime(t, orig, rule) {
  const n = t.meta.days.length;
  for (let d = 0; d < n; d++) {
    if (rule.day != null && rule.day !== d) continue;
    const day = t.meta.days[d];
    let start = toMin(day.start);
    let end = toMin(day.end);
    const v = toMin(rule.time);
    if (start == null || end == null || v == null) continue;
    if (rule.type === "dayEnd") {
      end = rule.mode === "min" ? Math.min(end, v) : v;
      if (d === n - 1) end = Math.min(end, toMin(orig[d].end));
      end = Math.max(end, start + 60);
      // 그날 시각이 정해진 꼭 가기·고정 일정(예: 19:00 공연)은 끝나고 호텔까지 갈 시간까지 남긴다
      for (const [at, p] of fixedTimes(t, d)) end = Math.max(end, at + (p.duration || 0) + travel(p, t.meta.hotel).min + 5);
      if (d === n - 1) end = Math.min(end, toMin(orig[d].end));
    } else {
      start = rule.mode === "max" ? Math.max(start, v) : v;
      if (d === 0) start = Math.max(start, toMin(orig[0].start));
      for (const [at, p] of fixedTimes(t, d)) start = Math.min(start, at - travel(t.meta.hotel, p).min - 5);
      start = Math.min(start, end - 60);
    }
    Object.assign(day, { start: hhmm(start), end: hhmm(end) });
  }
}

// 요청 규칙을 반영한 일정 입력을 만든다.
// - exclude: 이번 일정에서 뺌 (뒤의 요청으로 다시 들어오지 않음) / must·include: 꼭 가기·갈 곳으로 포함
// - wish: 조건에 맞는 곳을 (보류 중이어도) 후보로 넣고, 그날·그 시간대에 들어가면 보상, 하나도 없으면 비용
//   장소 이름을 직접 말했으면 "가고 싶은 곳"(못 넣으면 알려줌), 조건으로 들어온 곳은 "extra"
// - avoid: 그날 조건에 맞는 곳(또는 그 장소)이 들어가면 비용
// - dayStart·dayEnd: 그날(없으면 매일) 시작·끝 시각 조정 / maxPlaces: 그날 장소가 max개를 넘으면 비용 (optimizer)
export function applyRequests(trip, requests) {
  const t = structuredClone(trip);
  const orig = structuredClone(trip.meta.days);
  const wishes = [];
  const excluded = new Set();
  const live = t.places.filter((p) => !p.deleted);
  const named = (p, must) => {
    if (must) Object.assign(p, { selected: true, priority: "must" });
    else if (!p.selected) Object.assign(p, { selected: true, priority: p.priority === "must" ? "must" : "want" });
  };
  for (const req of requests || []) {
    for (const rule of parseRequest(req.text, trip)) {
      if (rule.type === "dayStart" || rule.type === "dayEnd") {
        applyTime(t, orig, rule);
        continue;
      }
      if (rule.type === "sameDay") {
        // 같은 날: 그 장소들이 들어간 날이 하루를 넘으면 큰 비용 (groupDays와 같은 방식)
        const ids = rule.ids.filter((id) => !excluded.has(id));
        for (const p of live) if (ids.includes(p.id)) Object.assign(p, { allowFar: true }) && named(p, false);
        wishes.push({ type: "groupDays", maxDays: 1, ids: new Set(ids), label: describeRule(rule, trip) });
        continue;
      }
      if (rule.near) {
        // 장소 근처(800m 안, 분점 포함)의 곳들 — 종류 조건이 있으면 그 종류만. 근처 곳들은 못 넣어도 되는 후보
        const centers = live.filter((p) => rule.near.includes(p.id));
        const close = (loc) => centers.some((c) => distanceKm(loc, c) <= 0.8);
        const ids = live
          .filter((p) => !excluded.has(p.id) && !rule.near.includes(p.id))
          .filter((p) => (!rule.cond || matchesPlace(p, rule.cond)) && (close(p) || (p.branches || []).some(close)))
          .map((p) => p.id);
        for (const p of live) if (ids.includes(p.id) && !p.selected) Object.assign(p, { selected: true, priority: "extra" });
        wishes.push({ type: "wish", day: rule.day, part: rule.part, ids: new Set(ids), win: rule.part ? PARTS[rule.part].win : null, accept: null, label: describeRule(rule, trip) });
        continue;
      }
      if (rule.type === "groupDays" || rule.type === "onlyDays" || rule.type === "everyDay") {
        const ids = live.filter((p) => !excluded.has(p.id) && (matchesPlace(p, rule.cond) || (p.branches || []).some((b) => matchesPlace(p, rule.cond, b)))).map((p) => p.id);
        const n = t.meta.days.length;
        // 그 종류가 들어가는 날 수를 maxDays 이하로 (optimizer가 일정 전체를 보고 비용)
        const label = describeRule(rule, trip);
        if (rule.type === "groupDays") wishes.push({ type: "groupDays", maxDays: rule.maxDays, ids: new Set(ids), label });
        // 정한 날에만: 나머지 날은 피하기, 정한 날엔 넣기
        if (rule.type === "onlyDays")
          for (let d = 0; d < n; d++) wishes.push({ type: rule.days.includes(d) ? "wish" : "avoid", day: d, part: null, ids: new Set(ids), win: null, accept: null, label });
        // 매일: 날마다 하나 이상
        if (rule.type === "everyDay") for (let d = 0; d < n; d++) wishes.push({ type: "wish", day: d, part: null, ids: new Set(ids), win: null, accept: null, label: `${label} (DAY ${d + 1})` });
        if (rule.type !== "groupDays") for (const p of live) if (ids.includes(p.id) && !p.selected) Object.assign(p, { selected: true, priority: "extra" });
        continue;
      }
      if (rule.type === "maxPlaces") {
        wishes.push({ type: "maxPlaces", day: rule.day, max: rule.max, ids: new Set(), label: describeRule(rule, trip) });
        continue;
      }
      if (rule.type === "exclude") {
        for (const p of live) if (rule.ids.includes(p.id)) Object.assign(p, { selected: false });
        rule.ids.forEach((id) => excluded.add(id));
        continue;
      }
      const ids = (rule.ids || live.filter((p) => matchesPlace(p, rule.cond) || (p.branches || []).some((b) => matchesPlace(p, rule.cond, b))).map((p) => p.id)).filter(
        (id) => rule.type === "avoid" || !excluded.has(id),
      );
      if (rule.type === "must" || rule.type === "include") {
        for (const p of live) if (ids.includes(p.id)) named(p, rule.type === "must");
        continue;
      }
      if (rule.type === "wish") {
        for (const p of live) {
          if (!ids.includes(p.id)) continue;
          if (rule.ids) named(p, rule.must); // 장소 이름을 직접 말함 — 못 넣으면 알려줘야 함
          else if (!p.selected) Object.assign(p, { selected: true, priority: "extra" }); // 조건 때문에 들어온 후보 — 못 넣어도 괜찮음
          if (!rule.ids && rule.must) p.allowFar = true; // "꼭"이 붙은 조건 요청은 권역 제한을 넘어서라도
          // 날짜를 고정하되, 공연처럼 정해진 날짜가 있는 곳은 그 날짜와 맞을 때만 (안 맞으면 못 지킨 요청으로 표시됨)
          const slotDays = (p.slots || []).map((x) => x.day).filter((x) => x != null);
          if (rule.ids && rule.day != null && (!slotDays.length || slotDays.includes(rule.day))) p.pin = { ...(p.pin || {}), day: rule.day };
          if (rule.ids && rule.part) p.reqWindow = PARTS[rule.part].win;
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
      wishes.push({ ...rule, ids: new Set(ids), win: rule.part ? PARTS[rule.part].win : null, accept, label: describeRule(rule, trip) });
    }
  }
  return { trip: t, wishes };
}
