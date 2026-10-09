// 선택한 장소들을 여행 기간 전체에 자동 배치한다.
// 하루는 호텔에서 출발해 호텔로 돌아오며, 고정 일정은 체크인(첫날 시작)·체크아웃(마지막 날 끝)뿐이다.
// 방식: 제약이 많은 곳부터 비용이 가장 적게 늘어나는 자리에 끼워 넣은 뒤,
//       일부를 빼고 다시 넣는(ruin & recreate) 과정을 반복하며 개선한다.
// 분점: 장소에 분점이 있으면 일정마다 앞뒤 동선에 가장 맞는 지점을 고른다.
// 끼니: 하루 시간이 점심·저녁 시간대를 포함하면 그 끼니를 기대한다. 고른 식당이 없으면
//       "자유 식사" 자리(위치 없음)를 비워두고, 그마저 못 넣으면 비용을 크게 매긴다.
import { parseHours, toMin, weekdayOf } from "./hours.js";
import { cat, MEAL_WINDOWS, MEAL_SLOTS } from "./categories.js";
import { travel, distanceKm } from "./geo.js";
import { districtOf, districtsNear } from "./areas.js";

// must: "꼭 가기"는 이동 상한·권역 제한 같은 다른 어떤 조건보다 우선한다
const UNSCHEDULED_PENALTY = { must: 100000, want: 1000, extra: 150 };
const MUST_DISTRICT_COST = 500; // 꼭 가기 때문에 권역 제한을 넘긴 경우 // extra: 문장 요청 때문에 후보로 들어온 곳
const WISH_REWARD = 90; // 요청에 맞는 곳 하나를 그날 넣을 때마다 (하루 8곳까지)
const WISH_MISS = 2500; // 날짜를 정한 요청이 그날 하나도 안 지켜지면 — "가고 싶음" 장소 하나(1000)를 빼서라도 지키게
const WISH_MISS_MUST = 6000;
const AVOID_COST = 3000; // "그날은 쇼핑 빼줘"·"쇼핑은 첫째날에만"을 어긴 곳마다 — 장소를 빼는 것(1000)보다 크게
const GROUP_DAYS_COST = 5000; // "N일에 몰아서"를 넘긴 날마다 — 그 종류 장소를 빼서라도 지킨다
const MAX_PLACES_COST = 1500; // "그날은 N곳만"·"여유롭게"에서 넘는 장소 하나마다 — 장소를 빼서라도 지킨다
// 옵션 — 이동 최소: 이동 1분을 더 무겁게 보고, 멀리 있는 "가고 싶음" 장소는 빠질 수 있게 한다
const MIN_TRAVEL = { travelWeight: 4, wantPenalty: 250 };
// 옵션 — 하루 이동 상한(분): 넘는 1분마다 이 비용. "가고 싶음" 장소 하나(1000)보다 크게 잡아, 3분만 넘어도 장소를 빼서 맞춘다
const OVER_DAILY_COST = 400;
// 하루에 가는 권역(걸어서 이어지는 동네 묶음) 최대 개수 — 두 개면 서로 가까운 권역이어야 한다
const MAX_DISTRICTS_PER_DAY = 2; // "그날은 쇼핑 빼줘" 같은 요청을 어긴 곳마다
const WAIT_WEIGHT = 0.25;
const BALANCE_WEIGHT = 0.3;
const FREE_MEAL_COST = 150; // 식당 대신 자유 식사로 채운 끼니
const MISSING_MEAL_COST = 600; // 아예 식사 시간이 없는 끼니
// 선호(어겨도 되지만 비용이 붙음): 끼니는 보통 시간에, 하루는 오전부터
const MEAL_IDEAL = { lunch: [12 * 60, 13.5 * 60], dinner: [18 * 60, 19.5 * 60] };
const MEAL_OFF_WEIGHT = 2; // 이상적인 식사 시간에서 1분 벗어날 때마다
const LATE_START_AFTER = 10 * 60;
const LATE_START_WEIGHT = 1; // 아침 10시 이후 첫 일정 시작이 1분 늦어질 때마다

const KICK_AFTER = 200; // 이만큼 반복해도 최선이 안 나아지면 크게 흔든다
const KICK_TEMP = 2; // 흔든 뒤 온도 (처음 온도의 배수) — 높여야 다른 국소해로 넘어간다

export function tripDate(meta, dayIdx) {
  const [y, m, d] = meta.startDate.split("-").map(Number);
  return new Date(y, m - 1, d + dayIdx);
}

function intersect(ranges, [a, b]) {
  const out = [];
  for (const [lo, hi] of ranges) {
    const l = Math.max(lo, a);
    const h = Math.min(hi, b);
    if (l <= h) out.push([l, h]);
  }
  return out;
}

// 장소 p를 day에 "몇 시에 시작할 수 있는지" 구간 목록 (도착 시간은 아직 고려하지 않음)
function startRanges(p, dayIdx, meta) {
  const day = meta.days[dayIdx];
  const dayStart = toMin(day.start);
  const dayEnd = toMin(day.end);
  const dur = p.duration;
  const pin = p.pin || {};
  if (pin.day != null && pin.day !== dayIdx) return [];

  const pinTime = toMin(pin.time);
  if (pinTime != null) return [[pinTime, pinTime]];

  const slots = (p.slots || []).filter((s) => s.day == null || s.day === dayIdx).map((s) => toMin(s.time)).filter((t) => t != null);
  if ((p.slots || []).length) return slots.sort((a, b) => a - b).map((t) => [t, t]);

  const c = cat(p.category);
  const week = parseHours(p.hours);
  const open = week ? week[weekdayOf(tripDate(meta, dayIdx))] : c.hours;
  let ranges = open.map(([o, cl]) => [o, cl - dur]).filter(([a, b]) => a <= b);

  if (c.meal === "any") {
    // mealPref: 아침·점심·저녁 중 하나로만 / 상관없음(null = 점심 또는 저녁)
    const meals = MEAL_WINDOWS[p.mealPref] ? [p.mealPref] : ["lunch", "dinner"];
    if (!week && p.mealPref === "breakfast") ranges = [[7 * 60, 11 * 60 - dur]];
    ranges = meals.flatMap((m) => intersect(ranges, MEAL_WINDOWS[m]));
  } else if (c.meal) {
    ranges = intersect(ranges, MEAL_WINDOWS[c.meal]);
  } else if (c.window) {
    ranges = intersect(ranges, c.window);
  }
  // 문장 요청으로 정한 시간대 ("둘째날 저녁은 피터루거" → 저녁 시간대에만)
  if (p.reqWindow) ranges = intersect(ranges, p.reqWindow);
  return intersect(ranges, [dayStart, dayEnd - dur]).sort((a, b) => a[0] - b[0]);
}

// 식당 일정이 어느 끼니인지 — 그 끼니 시간대에 시작할 때만 끼니로 친다 (고정 시각이 10시 같은 경우는 끼니 아님)
const inWin = (t, m) => MEAL_WINDOWS[m] && t >= MEAL_WINDOWS[m][0] && t <= MEAL_WINDOWS[m][1];
function mealOf(p, start) {
  if (p.freeMeal) return p.freeMeal;
  const meal = cat(p.category).meal;
  if (!meal) return null;
  if (meal !== "any") return inWin(start, meal) ? meal : null;
  if (p.mealPref === "breakfast") return inWin(start, "breakfast") ? "breakfast" : null;
  return ["lunch", "dinner"].find((m) => inWin(start, m)) || null;
}

// 날짜·시간을 고정한 곳은 꼭 가기처럼 다룬다 ("다시 만들어도 유지돼요")
const isPinned = (p) => !!p.pin && (p.pin.day != null || !!p.pin.time);

// wishes: requests.js의 applyRequests가 만든 요청 조건 ({ day, ids, win, accept(id, branch), type, must })
//         type "maxPlaces"는 { day, max }: 그날 실제 장소가 max곳을 넘으면 넘는 만큼 비용
// prefs: { minTravel, maxDaily } (설정의 이동 옵션)
export function createSolver(trip, wishes = [], prefs = {}) {
  const travelWeight = prefs.minTravel ? MIN_TRAVEL.travelWeight : 1;
  const meta = trip.meta;
  const hotel = { lat: meta.hotel.lat, lon: meta.hotel.lon, ix: 0 };
  let nLocs = 1; // 이동 시간 캐시용 번호 (0 = 호텔)
  const places = trip.places.filter((p) => p.selected && !p.deleted);
  const P = Object.fromEntries(places.map((p) => [p.id, p]));
  const nDays = meta.days.length;

  // 지점 목록: [본점(장소 자체), ...분점]. 분점 영업시간이 없으면 본점 영업시간을 쓴다
  const locs = {};
  const ranges = {}; // 지점 중 하나라도 가능한 시작 구간 (날짜 배정·제약 판단용)
  for (const p of places) {
    const list = [{ lat: p.lat, lon: p.lon, hours: p.hours }, ...(p.branches || []).map((b) => ({ lat: b.lat, lon: b.lon, hours: b.hours || p.hours }))];
    locs[p.id] = list.map((l, bi) => ({
      id: `${p.id}#${bi}`,
      ix: nLocs++,
      bi,
      lat: l.lat,
      lon: l.lon,
      ranges: Array.from({ length: nDays }, (_, d) => startRanges({ ...p, hours: l.hours }, d, meta)),
      district: districtOf(l),
    }));
    ranges[p.id] = Array.from({ length: nDays }, (_, d) => locs[p.id].flatMap((l) => l.ranges[d]).sort((a, b) => a[0] - b[0]));
  }

  // 날짜별로 기대하는 끼니와, 그 끼니의 자유 식사 자리(가상의 장소)
  const expectedMeals = meta.days.map((day, d) =>
    Object.entries(MEAL_SLOTS)
      .filter(([, slot]) => intersect([slot.window], [toMin(day.start), toMin(day.end) - slot.dur]).length)
      .map(([m]) => m),
  );
  const freeMealId = (m, d) => `__meal:${m}:${d}`;
  expectedMeals.forEach((meals, d) =>
    meals.forEach((m) => {
      const id = freeMealId(m, d);
      const slot = MEAL_SLOTS[m];
      P[id] = { id, freeMeal: m, duration: slot.dur };
      ranges[id] = Array.from({ length: nDays }, (_, x) =>
        x === d ? intersect([slot.window], [toMin(meta.days[d].start), toMin(meta.days[d].end) - slot.dur]) : [],
      );
    }),
  );
  const isFree = (id) => id.startsWith("__meal:");
  // 꼭 가기 수준(빠지면 큰 벌점): 꼭 가기 또는 날짜·시간 고정 (요청으로 들어온 후보는 제외)
  const mustLevel = (id) => !isFree(id) && (P[id].priority === "must" || (P[id].priority !== "extra" && isPinned(P[id])));

  const travelCache = new Array(nLocs * nLocs);
  const tr = (a, b) => {
    const key = a.ix * nLocs + b.ix;
    return travelCache[key] || (travelCache[key] = travel(a, b));
  };

  // "before" 관계: p.before = q → p는 q와 같은 날, q보다 먼저
  const afterOf = {}; // q → [p, ...]
  for (const p of places) if (p.before && P[p.before]) (afterOf[p.before] ||= []).push(p.id);

  // 같은 날·같은 순서는 결과가 같으므로 저장해 두고 다시 쓴다
  const dayStartMin = meta.days.map((x) => toMin(x.start));
  const dayEndMin = meta.days.map((x) => toMin(x.end));
  const NO_LOC = [null];
  const NO_LEG = { min: 0, mode: "none" };
  const memo = new Map();
  // 메모 키를 짧게: 장소마다 글자 하나
  const code = {};
  Object.keys(P).forEach((id, i) => (code[id] = String.fromCharCode(0x100 + i)));
  function evalDay(d, seq) {
    let key = String(d);
    for (const id of seq) key += code[id] || `|${id}|`;
    let v = memo.get(key);
    if (v === undefined) {
      if (memo.size > 200000) memo.clear();
      v = evalDayRaw(d, seq);
      memo.set(key, v);
    }
    return v;
  }

  function evalDayRaw(d, seq) {
    if (seq.some((id) => !P[id])) return null; // 목록에 없는 장소 (보류·제외된 곳)
    let t = dayStartMin[d];
    let prev = hotel;
    let travelSum = 0;
    let waitSum = 0;
    const meals = new Set();
    const districts = new Set();
    let districtViolations = 0;
    let subwaySum = 0;
    const items = [];
    let mealOff = 0;
    for (let i = 0; i < seq.length; i++) {
      const p = P[seq[i]];
      if (p.before && seq.indexOf(p.before) > -1 && seq.indexOf(p.before) < i) return null;
      // 자유 식사는 위치가 없으므로 직전 장소 근처에서 먹는 것으로 본다
      let cands = NO_LOC;
      if (!p.freeMeal) {
        cands = locs[p.id];
        if (cands.length > 1) {
          // 분점: 직전 위치 → 지점 → 다음 장소까지 이동이 짧은 순서로 시도
          let next = hotel;
          for (let j = i + 1; j < seq.length; j++) {
            if (!P[seq[j]].freeMeal) {
              next = locs[seq[j]][0];
              break;
            }
          }
          // 이미 간 권역의 지점을 우선하고, 그다음 이동이 짧은 순
          const via = (l) => tr(prev, l).min + tr(l, next).min + (districts.has(l.district) ? 0 : 1000);
          // 가장 가까운 지점을 먼저 (나머지는 그 지점이 안 될 때만 정렬)
          let bi = 0;
          for (let k = 1; k < cands.length; k++) if (via(cands[k]) < via(cands[bi])) bi = k;
          const first = cands[bi];
          const all = cands;
          cands = {
            *[Symbol.iterator]() {
              yield first;
              yield* all.filter((c) => c !== first).sort((a, b) => via(a) - via(b));
            },
          };
        }
      }
      let start = null;
      let meal = null;
      let leg = null;
      let loc = null;
      for (const c of cands) {
        // 그날 이미 간 권역이 2개면, 그 밖의 지점은 보지 않는다 (먼 분점 탐색도 여기서 걸러짐)
        // (꼭 가기 장소는 예외 — 대신 비용을 붙인다)
        let outside = false;
        if (c && !districts.has(c.district)) {
          outside = districts.size >= MAX_DISTRICTS_PER_DAY;
          for (const x of districts) if (!districtsNear(x, c.district)) outside = true;
        }
        // 꼭 가기, 그리고 "같은 날" 요청으로 묶은 장소는 권역 제한의 예외 (대신 비용)
        if (outside && !mustLevel(p.id) && !p.allowFar) continue;
        leg = c ? tr(prev, c) : NO_LEG;
        const arrive = t + leg.min;
        for (const [lo, hi] of c ? c.ranges[d] : ranges[p.id][d]) {
          if (hi < arrive) continue;
          const s = Math.max(lo, arrive);
          const m = mealOf(p, s);
          if (m && meals.has(m)) continue; // 점심이 이미 있으면 저녁 시간대로 넘긴다
          start = s;
          meal = m;
          break;
        }
        if (start != null) {
          loc = c;
          if (outside) districtViolations++;
          break;
        }
      }
      if (start == null) return null;
      if (loc) districts.add(loc.district);
      const arrive = t + leg.min;
      if (meal) {
        meals.add(meal);
        const ideal = MEAL_IDEAL[meal];
        if (ideal) mealOff += Math.max(0, ideal[0] - start, start - ideal[1]);
      }
      // 첫 장소 전 대기는 호텔에서 늦게 출발하면 되므로 대기로 치지 않는다
      const wait = i === 0 ? 0 : start - arrive;
      items.push({
        id: p.id,
        start,
        end: start + p.duration,
        travel: leg.min,
        mode: leg.mode,
        wait,
        ...(p.freeMeal ? { freeMeal: p.freeMeal } : {}),
        ...(loc && loc.bi ? { branch: loc.bi } : {}),
      });
      travelSum += leg.min;
      if (leg.mode === "subway") subwaySum += leg.min;
      waitSum += wait;
      t = start + p.duration;
      if (loc) prev = loc;
    }
    const back = seq.length ? tr(prev, hotel) : NO_LEG;
    const dayEnd = dayEndMin[d];
    if (t + back.min > dayEnd) return null;
    // 하루에 몰리지 않도록, 그날 쓸 수 있는 시간 대비 사용한 시간의 제곱에 비례해 비용을 더한다
    const used = items.length ? t + back.min - (items[0].start - items[0].travel) : 0;
    const balance = (BALANCE_WEIGHT * used * used) / Math.max(60, dayEnd - dayStartMin[d]);
    const freeMeals = items.filter((it) => it.freeMeal).length;
    // 오전을 쓸 수 있는 날인데 첫 일정이 늦게 시작하면 비용
    const lateStart = items.length && dayStartMin[d] <= LATE_START_AFTER ? Math.max(0, items[0].start - LATE_START_AFTER) : 0;
    const missingMeals = expectedMeals[d].filter((m) => !meals.has(m)).length;
    let wishCost = 0;
    for (const w of wishes) {
      if (w.day != null && w.day !== d) continue;
      if (w.type === "groupDays") continue; // 일정 전체를 봐야 해서 makeSolution에서 계산
      if (w.type === "maxPlaces") {
        wishCost += MAX_PLACES_COST * Math.max(0, items.filter((it) => !it.freeMeal).length - w.max);
        continue;
      }
      const hits = items.filter((it) => w.ids.has(it.id) && (!w.win || (it.start >= w.win[0] && it.start <= w.win[1])) && (!w.accept || w.accept(it.id, it.branch || 0))).length;
      if (w.type === "avoid") wishCost += AVOID_COST * hits;
      else {
        wishCost -= WISH_REWARD * Math.min(hits, 8);
        if (w.day != null && !hits) wishCost += w.must ? WISH_MISS_MUST : WISH_MISS;
      }
    }
    // 권역 하나로 끝나는 날을 조금 더 선호
    const areaCost = (districts.size > 1 ? 60 : 0) + MUST_DISTRICT_COST * districtViolations;
    // 상한은 지하철 이동에만 적용 (권역 안에서 걸어 다니는 건 구경으로 본다)
    const subwayTotal = subwaySum + (back.mode === "subway" ? back.min : 0);
    const overDaily = prefs.maxDaily ? Math.max(0, subwayTotal - prefs.maxDaily) : 0;
    const cost = travelWeight * (travelSum + back.min) + OVER_DAILY_COST * overDaily + areaCost + WAIT_WEIGHT * waitSum + balance + FREE_MEAL_COST * freeMeals + MISSING_MEAL_COST * missingMeals +
      MEAL_OFF_WEIGHT * mealOff + LATE_START_WEIGHT * lateStart + wishCost;
    return { items, back, travelSum: travelSum + back.min, subwayTotal, waitSum, cost, meals, districts: [...districts] };
  }

  // 날짜 사이 제약(before 관계가 같은 날이어야 함)
  function dayAllowed(id, d, assign) {
    const p = P[id];
    if (p.before && assign[p.before] != null && assign[p.before] !== d) return false;
    for (const q of afterOf[id] || []) if (assign[q] != null && assign[q] !== d) return false;
    return !!ranges[id] && ranges[id][d].length > 0;
  }

  const penalty = (id) =>
    mustLevel(id)
      ? UNSCHEDULED_PENALTY.must
      : prefs.minTravel && P[id].priority !== "extra"
        ? MIN_TRAVEL.wantPenalty
        : UNSCHEDULED_PENALTY[P[id].priority] ?? UNSCHEDULED_PENALTY.want;

  // "쇼핑은 하루에 몰아서": 그 종류가 들어간 날이 maxDays를 넘으면 넘는 날마다 비용
  const groupWishes = wishes.filter((w) => w.type === "groupDays");
  function groupCost(seqs) {
    let c = 0;
    for (const w of groupWishes) {
      const days = seqs.filter((seq) => seq.some((id) => w.ids.has(id))).length;
      c += GROUP_DAYS_COST * Math.max(0, days - w.maxDays);
    }
    return c;
  }

  // 장소 하나를 d일에 넣을 때 "N일에 몰기" 비용이 얼마나 늘어나는지
  function groupDelta(seqs, d, id) {
    if (!groupWishes.length) return 0;
    const after = seqs.map((seq, i) => (i === d ? [...seq, id] : seq));
    return groupCost(after) - groupCost(seqs);
  }

  // 날짜를 정하지 않은 요청("루프탑은 밤에")이 일정 어디에서도 안 지켜지면 비용
  const anyDayWishes = wishes.filter((w) => w.type === "wish" && w.day == null && w.ids?.size);
  function anyDayMiss(evals) {
    let c = 0;
    for (const w of anyDayWishes) {
      const hit = evals.some((ev) => ev.items.some((it) => w.ids.has(it.id) && (!w.win || (it.start >= w.win[0] && it.start <= w.win[1])) && (!w.accept || w.accept(it.id, it.branch || 0))));
      if (!hit) c += w.must ? WISH_MISS_MUST : WISH_MISS;
    }
    return c;
  }

  function makeSolution(seqs) {
    const evals = seqs.map((s, d) => evalDay(d, s));
    if (evals.some((e) => !e)) return null; // 장소를 빼면서 이동 경로가 오히려 길어져 하루를 넘긴 경우
    const assign = {};
    seqs.forEach((s, d) => s.forEach((id) => (assign[id] = d)));
    const unscheduled = places.map((p) => p.id).filter((id) => assign[id] == null);
    const cost = evals.reduce((a, e) => a + e.cost, 0) + unscheduled.reduce((a, id) => a + penalty(id), 0) + groupCost(seqs) + anyDayMiss(evals);
    return { seqs, evals, assign, unscheduled, cost };
  }

  // 그날 동선에 장소 하나를 가장 비용이 낮은 자리에 끼워 넣는다 (식당은 그날의 자유 식사 자리를 대신 차지할 수 있다)
  function insertInto(d, seq, id) {
    let best = null;
    const bases = [seq];
    if (!isFree(id) && cat(P[id].category).meal) for (const x of seq) if (isFree(x)) bases.push(seq.filter((y) => y !== x));
    for (const s of bases) {
      for (let i = 0; i <= s.length; i++) {
        const cand = [...s.slice(0, i), id, ...s.slice(i)];
        const ev = evalDay(d, cand);
        if (ev && (!best || ev.cost < best.ev.cost)) best = { seq: cand, ev };
      }
    }
    return best;
  }

  // 식당으로 채우지 못한 끼니에 자유 식사 자리를 넣는다 (비용이 줄 때만)
  function fillMeals(d, seq, ev) {
    for (const m of expectedMeals[d]) {
      const id = freeMealId(m, d);
      if (!ev || ev.meals.has(m) || seq.includes(id)) continue;
      const ins = insertInto(d, seq, id);
      if (ins && ins.ev.cost < ev.cost) ({ seq, ev } = ins);
    }
    return { seq, ev };
  }

  // 추천 적용용: 끼워 넣은 뒤 빈 끼니를 자유 식사로 채운다
  function addTo(d, seq, id) {
    const ins = insertInto(d, seq, id);
    return ins && fillMeals(d, ins.seq, ins.ev);
  }

  // 그날 동선에서 하나를 빼고, 비게 된 끼니는 자유 식사로 채운다
  function removeFrom(d, seq, id) {
    const rest = seq.filter((x) => x !== id);
    return fillMeals(d, rest, evalDay(d, rest));
  }

  function bestInsertion(sol, id, days = null) {
    let best = null;
    for (let d = 0; d < nDays; d++) {
      if (days && !days.includes(d)) continue;
      if (!dayAllowed(id, d, sol.assign)) continue;
      const ins = insertInto(d, sol.seqs[d], id);
      if (!ins) continue;
      const delta = ins.ev.cost - sol.evals[d].cost + groupDelta(sol.seqs, d, id);
      if (!best || delta < best.delta) best = { d, seq: ins.seq, ev: ins.ev, delta };
    }
    return best;
  }

  function apply(sol, ins) {
    for (const x of sol.seqs[ins.d]) if (!ins.seq.includes(x)) delete sol.assign[x];
    sol.seqs[ins.d] = ins.seq;
    sol.evals[ins.d] = ins.ev;
    for (const x of ins.seq) sol.assign[x] = ins.d;
  }

  // pref: { id: 날짜 } — 그 날짜에 먼저 넣어보고, 안 되면 아무 날에나
  function insertAll(sol, ids, pref = null) {
    for (const id of ids) {
      let ins = pref && pref[id] != null ? bestInsertion(sol, id, [pref[id]]) : null;
      if (!ins || ins.delta >= penalty(id)) ins = bestInsertion(sol, id);
      // 넣어서 늘어나는 비용이 안 넣을 때의 벌점보다 크면 넣지 않는다
      if (ins && ins.delta < penalty(id)) apply(sol, ins);
    }
    for (let d = 0; d < nDays; d++) {
      const f = fillMeals(d, sol.seqs[d], sol.evals[d]);
      sol.seqs[d] = f.seq;
      sol.evals[d] = f.ev;
    }
    return makeSolution(sol.seqs);
  }

  // 다듬기: 하루 안에서 장소 하나를 다른 위치로 옮겨보거나, 다른 날로 옮겨서 비용이 줄면 반영 (더 이상 안 줄 때까지)
  function polish(sol) {
    let improved = true;
    let rounds = 0;
    while (improved && rounds++ < 4) {
      improved = false;
      for (let d = 0; d < nDays; d++) {
        for (const id of [...sol.seqs[d]]) {
          if (!sol.seqs[d].includes(id)) continue;
          const without = sol.seqs[d].filter((x) => x !== id);
          const evWithout = evalDay(d, without);
          if (!evWithout) continue;
          const base = sol.evals[d].cost;
          let best = null;
          for (let e = 0; e < nDays; e++) {
            if (!isFree(id) && !dayAllowed(id, e, { ...sol.assign, [id]: undefined })) continue;
            if (isFree(id) && e !== d) continue;
            const seq = e === d ? without : sol.seqs[e];
            for (let i = 0; i <= seq.length; i++) {
              const cand = [...seq.slice(0, i), id, ...seq.slice(i)];
              const ev = evalDay(e, cand);
              if (!ev) continue;
              const delta = e === d ? ev.cost - base : evWithout.cost - base + ev.cost - sol.evals[e].cost;
              if (delta < -0.5 && (!best || delta < best.delta)) best = { e, cand, ev, delta };
            }
          }
          if (best) {
            if (best.e !== d) {
              sol.seqs[d] = without;
              sol.evals[d] = evWithout;
            }
            sol.seqs[best.e] = best.cand;
            sol.evals[best.e] = best.ev;
            sol.assign[id] = best.e;
            improved = true;
          }
        }
      }
    }
    return makeSolution(sol.seqs) || sol;
  }

  // 제약이 많을수록(시작 가능 시간이 좁을수록) 먼저 넣는다
  const flexibility = (id) => ranges[id].reduce((a, rs) => a + rs.reduce((b, [lo, hi]) => b + hi - lo + 15, 0), 0) - (mustLevel(id) ? 1e6 : 0);

  // from: 이어서 찾을 해 (없으면 새로 짠다)
  function solve({ timeBudgetMs = 700, seed = Date.now(), from = null } = {}) {
    let s = seed >>> 0 || 1;
    const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const shuffle = (a) => {
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };
    const t0 = Date.now();
    const empty = () => makeSolution(Array.from({ length: nDays }, () => []));
    const ids = places.map((p) => p.id);
    const district = (id) => locs[id][0].district;
    const districtList = [...new Set(ids.map(district))];
    // 권역마다 날짜를 무작위로 정해 그날에 먼저 넣어보며 처음부터 짠다 (권역↔날짜 배정을 크게 바꿔보는 용도)
    // base가 있으면 그 해의 날짜를 통째로 뒤섞어(DAY 1 일정 → DAY 3 등) 다시 짠다
    const rebuild = (base = null) => {
      const day = Object.fromEntries(districtList.map((x) => [x, Math.floor(rand() * nDays)]));
      const perm = shuffle([...Array(nDays).keys()]);
      const pref = Object.fromEntries(ids.map((id) => [id, base ? (base.assign[id] != null ? perm[base.assign[id]] : null) : day[district(id)]]));
      const order = [...ids].sort((a, b) => flexibility(a) - flexibility(b) + (rand() - 0.5) * 400);
      return polish(insertAll(empty(), order, pref));
    };
    // 시작 해: 넣는 순서·권역 배정을 여러 가지로 바꿔 만들어 보고 가장 좋은 것에서 출발 (첫 해가 나쁜 국소해에 갇히는 걸 줄임)
    let cur = from || polish(insertAll(empty(), [...ids].sort((a, b) => flexibility(a) - flexibility(b))));
    for (let k = 0; !from && k < 20 && Date.now() - t0 < timeBudgetMs * 0.2; k++) {
      const c = k < 3 ? polish(insertAll(empty(), [...ids].sort((a, b) => flexibility(a) - flexibility(b) + (rand() - 0.5) * 4000))) : rebuild();
      if (c.cost < cur.cost) cur = c;
    }
    let best = cur;
    // 온도는 비용 규모에 맞춘다 (옵션에 따라 비용 단위가 달라짐)
    const temp0 = 0.02 * Math.max(500, cur.cost);
    let temp = temp0;
    let iter = 0;

    // 일부를 빼고 다시 넣은 후보 하나 (kick: 크게 흔들기 — 두 날을 통째로 맞바꾸거나 비운다)
    function ruinRecreate(from, kick = false) {
      const seqs = from.seqs.map((x) => [...x]);
      const scheduled = seqs.flat();
      let removed;
      let pref = null;
      const real = scheduled.filter((id) => !isFree(id));
      const r = kick ? 0 : rand();
      if (r < 0.15 && nDays > 1) {
        // 날짜 바꾸기: 어떤 날의 한 권역 묶음을 다른 날로 통째로 옮겨본다 (그날의 묶음과 맞바꾸기도)
        const d = Math.floor(rand() * nDays);
        let e = Math.floor(rand() * (nDays - 1));
        if (e >= d) e++;
        const group = (x) => {
          const rl = seqs[x].filter((id) => !isFree(id));
          if (!rl.length) return [];
          const k = district(rl[Math.floor(rand() * rl.length)]);
          return kick || rand() < 0.3 ? rl : rl.filter((id) => district(id) === k);
        };
        const X = group(d);
        const Y = kick || rand() < 0.6 ? group(e) : [];
        removed = [...X, ...Y, ...seqs[d].filter(isFree), ...seqs[e].filter(isFree)];
        pref = {};
        X.forEach((id) => (pref[id] = e));
        Y.forEach((id) => (pref[id] = d));
      } else if (r < 0.3 && from.unscheduled.length) {
        // 빠진 곳 하나를 어떤 날에 억지로 넣어본다: 그날 가까운 곳 몇 개를 빼서 자리를 만들고, 뺀 곳은 다시 넣는다
        const u = from.unscheduled[Math.floor(rand() * from.unscheduled.length)];
        const days = [...Array(nDays).keys()].filter((d) => ranges[u][d].length);
        const d = days.length ? days[Math.floor(rand() * days.length)] : 0;
        const at = (id) => (isFree(id) ? locs[u][0] : locs[id][0]);
        const k = 1 + Math.floor(rand() * 4);
        removed = [...seqs[d]].sort((a, b) => distanceKm(at(a), locs[u][0]) - distanceKm(at(b), locs[u][0])).slice(0, k);
        // 식당이면 그날(가끔은 모든 날)의 식당·자유 식사도 빼서 끼니 자리를 다시 나눈다
        const isMealId = (id) => isFree(id) || cat(P[id].category).meal;
        if (cat(P[u].category).meal) removed.push(...(rand() < 0.5 ? seqs[d] : scheduled).filter(isMealId));
        pref = { [u]: d };
      } else if (r < 0.5 && real.length > 2) {
        // 가까운 장소 묶음을 통째로 빼서 다른 날로 옮겨볼 수 있게 한다 (관련 장소 제거)
        const at = (id) => locs[id][0];
        const seedId = real[Math.floor(rand() * real.length)];
        const k = 3 + Math.floor(rand() * Math.min(6, real.length - 2));
        removed = [...real].sort((a, b) => distanceKm(at(a), at(seedId)) - distanceKm(at(b), at(seedId))).slice(0, k);
      } else {
        const k = 1 + Math.floor(rand() * Math.min(4, Math.max(1, scheduled.length)));
        removed = shuffle([...scheduled]).slice(0, k);
      }
      if (r > 0.88) {
        // 가끔은 하루를 통째로 비워 날짜 배정을 크게 바꿔본다
        const d = Math.floor(rand() * nDays);
        removed.push(...seqs[d]);
      }
      const rm = new Set(removed);
      const ruined = makeSolution(seqs.map((x) => x.filter((id) => !rm.has(id))));
      if (!ruined) return null;
      // 다시 넣는 순서: 보통은 제약 많은 곳부터, 가끔은 원래 빠져 있던 곳부터 또는 무작위로
      // (방금 뺀 곳이 제자리를 바로 되찾아 다른 조합을 못 보는 일을 줄인다)
      const was = new Set(from.unscheduled);
      const o = rand();
      const key = (id) =>
        (mustLevel(id) ? -2e6 : 0) - (pref && pref[id] != null ? 1e6 : 0) +
        (o < 0.5 ? flexibility(id) + (mustLevel(id) ? 1e6 : 0) + rand() * 400 : o < 0.75 ? (was.has(id) ? 0 : 1e5) + rand() * 1e4 : rand() * 1e4);
      const pending = [...ruined.unscheduled].map((id) => [key(id), id]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
      return insertAll(ruined, pending, pref);
    }

    let lastKick = 0;
    while (Date.now() - t0 < timeBudgetMs && places.length > 1) {
      iter++;
      let cand = ruinRecreate(cur);
      if (!cand) continue;
      if (cand.cost < best.cost) cand = polish(cand); // 지금까지보다 좋은 후보만 다듬는다

      if (cand.cost < cur.cost || rand() < Math.exp((cur.cost - cand.cost) / temp)) cur = cand;
      if (cur.cost < best.cost - 0.5) {
        best = cur;
        lastKick = iter;
      }
      temp = Math.max(0.5, temp * 0.997);
      // 한동안 나아지지 않으면 가장 좋은 해를 크게 흔들어(날짜 맞바꾸기) 거기서 다시 찾는다
      if (iter - lastKick > KICK_AFTER) {
        const x = rand();
        const k = x < 0.33 ? rebuild() : x < 0.66 ? rebuild(best) : ruinRecreate(best, true);
        if (k) cur = polish(k);
        temp = temp0 * KICK_TEMP;
        lastKick = iter;
      }
    }
    return { ...best, iterations: iter };
  }

  // 빠진 이유 (꼭 가기 수준이면 "꼭 가기로 바꾸면" 같은 안내를 하지 않는다)
  function explain(id, sol) {
    const p = P[id];
    const feasibleAlone = [];
    for (let d = 0; d < nDays; d++) if (ranges[id][d].length && evalDay(d, [id])) feasibleAlone.push(d);
    if (!feasibleAlone.length) {
      if (isPinned(p)) return "고정한 날짜·시간에는 넣을 수 없어요";
      if ((p.slots || []).length) return "지정한 공연·예약 시각에 맞출 수 없어요";
      if (ranges[id].every((r) => !r.length)) return "여행 기간에 영업시간(또는 식사 시간대)과 맞는 날이 없어요";
      return "하루 일정 시간 안에 다녀올 수 없어요 (거리·소요시간 확인)";
    }
    const meal = cat(p.category).meal;
    if (meal && feasibleAlone.every((d) => sol.seqs[d].some((q) => !isFree(q) && cat(P[q].category).meal))) {
      return "같은 식사 시간대에 다른 식당이 이미 있어요";
    }
    // before 관계: 짝이 되는 곳이 이 장소가 갈 수 없는 날에 있으면
    const mates = [p.before, ...(afterOf[id] || [])].filter((q) => q && sol.assign[q] != null);
    if (mates.some((q) => !feasibleAlone.includes(sol.assign[q]))) return "함께 가기로(먼저 갈 곳) 정한 장소와 같은 날에 넣을 수 없어요";
    if (mustLevel(id)) {
      return "다른 꼭 가기·고정 일정과 시간(또는 권역)이 겹쳐 같이 넣을 수 없어요";
    }
    if (prefs.maxDaily) return `하루 이동 ${prefs.maxDaily}분 이내에 맞추느라 뺐어요 (꼭 가기로 바꾸면 넣어요)`;
    if (prefs.minTravel) return "이동 최소 모드라 동선에서 먼 곳은 뺐어요 (꼭 가기로 바꾸면 넣어요)";
    return "시간이 부족해요 — 다른 장소를 빼거나 하루 시간을 늘려보세요";
  }

  return { solve, explain, evalDay, expectedMeals, places: P, addTo, removeFrom, dayAllowed, makeSolution, groupDelta };
}

// 추천: 빼면 이동이 크게 줄어드는 곳 / 보류 중이지만 동선에 거의 그대로 끼워 넣을 수 있는 곳
// (적용할 때와 같은 함수 — removeFrom/addTo — 로 계산해야 보여준 분만큼 정확히 바뀐다)
const SUGGEST_REMOVE_MIN = 15; // 이만큼 이상 줄어야 "빼기" 추천
const SUGGEST_ADD_MAX = 12; // 이만큼 이하로 늘어야 "추가" 추천
function suggest(trip, sol, opts) {
  // 요청으로 뺀 곳(opts.excludedIds)은 후보로 되살리지 않는다
  const excluded = opts.excludedIds || new Set();
  const all = { ...trip, places: trip.places.map((p) => (p.deleted || p.selected || excluded.has(p.id) ? p : { ...p, selected: true })) };
  const probe = createSolver(all, opts.wishes || [], opts.prefs || {});
  const P = probe.places;
  const original = Object.fromEntries(trip.places.map((p) => [p.id, p]));
  const remove = [];
  sol.seqs.forEach((seq, d) => {
    const base = probe.evalDay(d, seq);
    if (!base) return;
    for (const id of seq) {
      const p = original[id];
      // 꼭 가기·고정한 곳·요청으로 들어온 후보는 제외
      // 문장 요청이 직접 넣은 곳(opts.forcedIds)도 빼면 다음에 다시 들어오므로 제외
      if (!p || !p.selected || p.priority === "must" || p.priority === "extra" || isPinned(p) || opts.forcedIds?.has(id)) continue;
      const { ev } = probe.removeFrom(d, seq, id);
      if (ev && base.travelSum - ev.travelSum >= SUGGEST_REMOVE_MIN) remove.push({ id, day: d, save: base.travelSum - ev.travelSum });
    }
  });
  const assign = {};
  sol.seqs.forEach((seq, d) => seq.forEach((id) => (assign[id] = d)));
  const add = [];
  for (const p of trip.places) {
    if (p.deleted || p.selected || excluded.has(p.id) || !P[p.id]) continue;
    let best = null;
    sol.seqs.forEach((seq, d) => {
      if (!probe.dayAllowed(p.id, d, assign)) return; // before 관계는 같은 날이어야 한다
      const base = probe.evalDay(d, seq);
      const ins = base && probe.addTo(d, seq, p.id);
      // "N일에 몰아서"를 깨는 날에는 추천하지 않는다
      if (ins && probe.groupDelta(sol.seqs, d, p.id) > 0) return;
      // 적용할 때와 같은 기준(비용이 가장 낮은 자리)으로 고르고, 그 자리의 이동 증가를 보여준다
      if (ins && (!best || ins.ev.cost - base.cost < best.dc)) best = { id: p.id, day: d, extra: ins.ev.travelSum - base.travelSum, dc: ins.ev.cost - base.cost };
    });
    if (best && best.extra <= SUGGEST_ADD_MAX) add.push(best);
  }
  return {
    remove: remove.sort((a, b) => b.save - a.save).slice(0, 5),
    add: add.sort((a, b) => a.extra - b.extra).slice(0, 5).map(({ dc, ...x }) => x),
  };
}

// 해 → 저장할 일정 (opts.inputsKey가 있으면 그 키를 쓴다 — 앱은 요청 반영 전 원래 여행의 키와 비교하므로)
function buildSchedule(trip, solver, sol, opts) {
  const unmet = unmetWishes(opts.wishes, sol.evals.map((ev) => ({ items: ev.items })));
  return {
    generatedAt: Date.now(),
    unmet,
    inputsKey: opts.inputsKey ?? inputsKey(trip),
    days: sol.evals.map((ev, d) => ({
      items: ev.items,
      back: { travel: ev.back.min, mode: ev.back.mode },
      missingMeals: solver.expectedMeals[d].filter((m) => !ev.meals.has(m)),
      districts: ev.districts,
    })),
    suggest: suggest(trip, sol, opts),
    unscheduled: sol.unscheduled.filter((id) => solver.places[id].priority !== "extra").map((id) => ({ id, reason: solver.explain(id, sol) })),
    stats: {
      travel: sol.evals.reduce((a, e) => a + e.travelSum, 0),
      wait: sol.evals.reduce((a, e) => a + e.waitSum, 0),
      freeMeals: sol.evals.reduce((a, e) => a + e.items.filter((it) => it.freeMeal).length, 0),
      iterations: sol.iterations,
      cost: Math.round(sol.cost),
    },
  };
}

// 추천을 적용: 전체를 다시 짜지 않고 그날 동선에서 장소 하나만 빼거나 가장 좋은 자리에 끼워 넣는다.
// (다시 짜면 빈 시간에 다른 곳이 채워져 추천에 적힌 만큼 줄지 않기 때문)
// 그대로 적용할 수 없으면 null — 앱은 다시 짠다
export function applySuggestion(trip, schedule, { type, id, day }, opts = {}) {
  const solver = createSolver(trip, opts.wishes || [], opts.prefs || {});
  const seqs = schedule.days.map((d) => d.items.map((it) => it.id));
  if (!seqs[day] || seqs.flat().some((x) => !solver.places[x] && !(type === "remove" && x === id))) return null; // 일정과 장소 목록이 어긋남
  let r;
  if (type === "remove") {
    if (!seqs[day].includes(id)) return null;
    r = solver.removeFrom(day, seqs[day], id);
  } else {
    if (!solver.places[id] || seqs.flat().includes(id)) return null;
    const assign = {};
    seqs.forEach((s, d) => s.forEach((x) => (assign[x] = d)));
    if (!solver.dayAllowed(id, day, assign)) return null;
    r = solver.addTo(day, seqs[day], id);
  }
  if (!r || !r.ev) return null;
  seqs[day] = r.seq;
  // 모든 날을 다시 평가해 비용·대기·자유 식사·빠진 곳을 함께 맞춘다
  const sol = solver.makeSolution(seqs);
  if (!sol) return null;
  return buildSchedule(trip, solver, { ...sol, iterations: schedule.stats?.iterations }, opts);
}

// 결과에서 지켜지지 않은 요청 (화면에 알려줌). label은 requests.js가 붙인 설명
export function unmetWishes(wishes, days) {
  const out = [];
  for (const w of wishes || []) {
    if (!w.label) continue;
    const dayItems = (d) => (days[d]?.items || []).filter((it) => w.ids?.has(it.id) && (!w.win || (it.start >= w.win[0] && it.start <= w.win[1])) && (!w.accept || w.accept(it.id, it.branch || 0)));
    const anyDay = days.some((_, d) => dayItems(d).length);
    if (w.type === "wish" && !w.ids?.size) out.push(`${w.label} (맞는 장소가 없어요)`);
    else if (w.type === "wish" && (w.day != null ? !dayItems(w.day).length : !anyDay)) out.push(w.label);
    if (w.type === "avoid" && (w.day != null ? dayItems(w.day).length : anyDay)) out.push(w.label);
    if (w.type === "maxPlaces")
      for (let d = 0; d < days.length; d++)
        if ((w.day == null || w.day === d) && (days[d]?.items || []).filter((it) => !it.freeMeal).length > w.max) out.push(`${w.label} (DAY ${d + 1})`);
    if (w.type === "groupDays" && days.filter((_, d) => dayItems(d).length).length > w.maxDays) out.push(w.label);
  }
  return [...new Set(out)];
}

export function generateSchedule(trip, opts = {}) {
  const solver = createSolver(trip, opts.wishes || [], opts.prefs || {});
  // 한 번의 탐색은 국소 최적해에 갇히기 쉬워, 여러 출발점을 짧게 찾아본 뒤 좋은 절반만 남겨
  // 시간을 두 배씩 더 주는 식으로 좁혀 간다 (restarts = 처음 출발점 수, 단계마다 쓰는 시간은 같음)
  const { timeBudgetMs = 2000, restarts = 8, seed = Date.now() } = opts;
  const rounds = Math.ceil(Math.log2(Math.max(1, restarts))) + 1;
  const t0 = Date.now();
  let pool = Array.from({ length: Math.max(1, restarts) }, () => null);
  let iterations = 0;
  for (let k = 0; k < rounds; k++) {
    const until = t0 + (timeBudgetMs * (k + 1)) / rounds;
    pool = pool.map((from, i) => {
      const left = Math.max(1, (until - Date.now()) / (pool.length - i));
      const sol = solver.solve({ timeBudgetMs: left, seed: seed + (k * 64 + i) * 7919, from });
      iterations += sol.iterations;
      return sol;
    });
    pool.sort((a, b) => a.cost - b.cost);
    if (k < rounds - 1) pool = pool.slice(0, Math.ceil(pool.length / 2));
  }
  const sol = { ...pool[0], iterations };
  return buildSchedule(trip, solver, sol, opts);
}

// 일정 결과에 영향을 주는 입력만 모은 문자열 — 바뀌면 "다시 만들기"를 권한다
// 요청이 보류 중인 곳도 끌어오고 이름·종류·메뉴·태그로 고르므로, 지우지 않은 모든 장소를 넣는다
export function inputsKey(trip) {
  const ps = trip.places
    .filter((p) => !p.deleted)
    .map((p) =>
      JSON.stringify([p.id, !!p.selected, p.name, p.lat, p.lon, p.category, p.cuisine || "", p.mealPref || "", p.duration, p.hours || "", p.priority, p.before || "", p.slots || [], p.pin || {}, p.branches || [], p.tags || []]),
    )
    .sort();
  const m = trip.meta;
  return JSON.stringify([m.startDate, m.hotel.lat, m.hotel.lon, m.days, ps, (m.requests || []).map((r) => r.text), m.prefs || {}]);
}
