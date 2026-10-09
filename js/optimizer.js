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
import { areaOf } from "./areas.js";

const UNSCHEDULED_PENALTY = { must: 5000, want: 1000, extra: 150 }; // extra: 문장 요청 때문에 후보로 들어온 곳
const WISH_REWARD = 90; // 요청에 맞는 곳 하나를 그날 넣을 때마다 (하루 8곳까지)
const WISH_MISS = 700; // 날짜를 정한 요청이 그날 하나도 안 지켜지면
const WISH_MISS_MUST = 3000;
const AVOID_COST = 400;
// 옵션 — 이동 최소: 이동 1분을 더 무겁게 보고, 멀리 있는 "가고 싶음" 장소는 빠질 수 있게 한다
const MIN_TRAVEL = { travelWeight: 4, wantPenalty: 250 };
// 옵션 — 하루 한 동네: 그날 동네가 하나 늘 때마다
const EXTRA_AREA_COST = 150; // "그날은 쇼핑 빼줘" 같은 요청을 어긴 곳마다
const WAIT_WEIGHT = 0.25;
const BALANCE_WEIGHT = 0.3;
const FREE_MEAL_COST = 150; // 식당 대신 자유 식사로 채운 끼니
const MISSING_MEAL_COST = 600; // 아예 식사 시간이 없는 끼니
// 선호(어겨도 되지만 비용이 붙음): 끼니는 보통 시간에, 하루는 오전부터
const MEAL_IDEAL = { lunch: [12 * 60, 13.5 * 60], dinner: [18 * 60, 19.5 * 60] };
const MEAL_OFF_WEIGHT = 2; // 이상적인 식사 시간에서 1분 벗어날 때마다
const LATE_START_AFTER = 10 * 60;
const LATE_START_WEIGHT = 1; // 아침 10시 이후 첫 일정 시작이 1분 늦어질 때마다

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
  return intersect(ranges, [dayStart, dayEnd - dur]).sort((a, b) => a[0] - b[0]);
}

function mealOf(p, start) {
  if (p.freeMeal) return p.freeMeal;
  const meal = cat(p.category).meal;
  if (!meal) return null;
  if (meal !== "any") return meal;
  if (p.mealPref === "breakfast") return "breakfast";
  return start < MEAL_WINDOWS.dinner[0] ? "lunch" : "dinner";
}

// wishes: requests.js의 applyRequests가 만든 요청 조건 ({ day, ids, win, accept(id, branch), type, must })
// prefs: { minTravel, oneArea } (설정의 이동 옵션)
export function createSolver(trip, wishes = [], prefs = {}) {
  const travelWeight = prefs.minTravel ? MIN_TRAVEL.travelWeight : 1;
  const meta = trip.meta;
  const hotel = { lat: meta.hotel.lat, lon: meta.hotel.lon };
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
      bi,
      lat: l.lat,
      lon: l.lon,
      ranges: Array.from({ length: nDays }, (_, d) => startRanges({ ...p, hours: l.hours }, d, meta)),
      area: areaOf(l),
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

  const travelCache = new Map();
  const tr = (a, b) => {
    const key = `${a.id || "hotel"}>${b.id || "hotel"}`;
    let v = travelCache.get(key);
    if (!v) travelCache.set(key, (v = travel(a, b)));
    return v;
  };

  // "before" 관계: p.before = q → p는 q와 같은 날, q보다 먼저
  const afterOf = {}; // q → [p, ...]
  for (const p of places) if (p.before && P[p.before]) (afterOf[p.before] ||= []).push(p.id);

  // 같은 날·같은 순서는 결과가 같으므로 저장해 두고 다시 쓴다
  const memo = new Map();
  function evalDay(d, seq) {
    const key = `${d}|${seq.join(",")}`;
    let v = memo.get(key);
    if (v === undefined) {
      if (memo.size > 200000) memo.clear();
      v = evalDayRaw(d, seq);
      memo.set(key, v);
    }
    return v;
  }

  function evalDayRaw(d, seq) {
    const day = meta.days[d];
    let t = toMin(day.start);
    let prev = hotel;
    let travelSum = 0;
    let waitSum = 0;
    const meals = new Set();
    const items = [];
    let mealOff = 0;
    for (let i = 0; i < seq.length; i++) {
      const p = P[seq[i]];
      if (p.before && seq.indexOf(p.before) > -1 && seq.indexOf(p.before) < i) return null;
      // 자유 식사는 위치가 없으므로 직전 장소 근처에서 먹는 것으로 본다
      let cands = [null];
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
          const via = (l) => tr(prev, l).min + tr(l, next).min;
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
        leg = c ? tr(prev, c) : { min: 0, mode: "none" };
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
          break;
        }
      }
      if (start == null) return null;
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
      waitSum += wait;
      t = start + p.duration;
      if (loc) prev = loc;
    }
    const back = seq.length ? tr(prev, hotel) : { min: 0, mode: "none" };
    const dayEnd = toMin(day.end);
    if (t + back.min > dayEnd) return null;
    // 하루에 몰리지 않도록, 그날 쓸 수 있는 시간 대비 사용한 시간의 제곱에 비례해 비용을 더한다
    const used = items.length ? t + back.min - (items[0].start - items[0].travel) : 0;
    const balance = (BALANCE_WEIGHT * used * used) / Math.max(60, dayEnd - toMin(day.start));
    const freeMeals = items.filter((it) => it.freeMeal).length;
    // 오전을 쓸 수 있는 날인데 첫 일정이 늦게 시작하면 비용
    const lateStart = items.length && toMin(day.start) <= LATE_START_AFTER ? Math.max(0, items[0].start - LATE_START_AFTER) : 0;
    const missingMeals = expectedMeals[d].filter((m) => !meals.has(m)).length;
    let wishCost = 0;
    for (const w of wishes) {
      if (w.day != null && w.day !== d) continue;
      const hits = items.filter((it) => w.ids.has(it.id) && (!w.win || (it.start >= w.win[0] && it.start < w.win[1])) && (!w.accept || w.accept(it.id, it.branch || 0))).length;
      if (w.type === "avoid") wishCost += AVOID_COST * hits;
      else {
        wishCost -= WISH_REWARD * Math.min(hits, 8);
        if (w.day != null && !hits) wishCost += w.must ? WISH_MISS_MUST : WISH_MISS;
      }
    }
    let areaCost = 0;
    if (prefs.oneArea) {
      const areas = new Set();
      for (const it of items) if (!it.freeMeal) areas.add(locs[it.id][it.branch || 0].area);
      areaCost = EXTRA_AREA_COST * Math.max(0, areas.size - 1);
    }
    const cost = travelWeight * (travelSum + back.min) + areaCost + WAIT_WEIGHT * waitSum + balance + FREE_MEAL_COST * freeMeals + MISSING_MEAL_COST * missingMeals +
      MEAL_OFF_WEIGHT * mealOff + LATE_START_WEIGHT * lateStart + wishCost;
    return { items, back, travelSum: travelSum + back.min, waitSum, cost, meals };
  }

  // 날짜 사이 제약(before 관계가 같은 날이어야 함)
  function dayAllowed(id, d, assign) {
    const p = P[id];
    if (p.before && assign[p.before] != null && assign[p.before] !== d) return false;
    for (const q of afterOf[id] || []) if (assign[q] != null && assign[q] !== d) return false;
    return ranges[id][d].length > 0;
  }

  const penalty = (id) =>
    prefs.minTravel && P[id].priority !== "must" && P[id].priority !== "extra" ? MIN_TRAVEL.wantPenalty : UNSCHEDULED_PENALTY[P[id].priority] ?? UNSCHEDULED_PENALTY.want;

  function makeSolution(seqs) {
    const evals = seqs.map((s, d) => evalDay(d, s));
    if (evals.some((e) => !e)) return null; // 장소를 빼면서 이동 경로가 오히려 길어져 하루를 넘긴 경우
    const assign = {};
    seqs.forEach((s, d) => s.forEach((id) => (assign[id] = d)));
    const unscheduled = places.map((p) => p.id).filter((id) => assign[id] == null);
    const cost = evals.reduce((a, e) => a + e.cost, 0) + unscheduled.reduce((a, id) => a + penalty(id), 0);
    return { seqs, evals, assign, unscheduled, cost };
  }

  function bestInsertion(sol, id, days = null) {
    let best = null;
    const isMeal = !!cat(P[id].category).meal;
    for (let d = 0; d < nDays; d++) {
      if (days && !days.includes(d)) continue;
      if (!dayAllowed(id, d, sol.assign)) continue;
      // 식당은 그날의 자유 식사 자리를 대신 차지할 수 있다
      const bases = [sol.seqs[d]];
      if (isMeal) for (const x of sol.seqs[d]) if (isFree(x)) bases.push(sol.seqs[d].filter((y) => y !== x));
      for (const seq of bases) {
        for (let i = 0; i <= seq.length; i++) {
          const cand = [...seq.slice(0, i), id, ...seq.slice(i)];
          const ev = evalDay(d, cand);
          if (!ev) continue;
          const delta = ev.cost - sol.evals[d].cost;
          if (!best || delta < best.delta) best = { d, seq: cand, ev, delta };
        }
      }
    }
    return best;
  }

  function apply(sol, ins) {
    for (const x of sol.seqs[ins.d]) if (!ins.seq.includes(x)) delete sol.assign[x];
    sol.seqs[ins.d] = ins.seq;
    sol.evals[ins.d] = ins.ev;
    for (const x of ins.seq) sol.assign[x] = ins.d;
  }

  function insertAll(sol, ids) {
    for (const id of ids) {
      const ins = bestInsertion(sol, id);
      if (ins) apply(sol, ins);
    }
    // 식당으로 채우지 못한 끼니에 자유 식사 자리를 넣는다
    for (let d = 0; d < nDays; d++) {
      for (const m of expectedMeals[d]) {
        if (sol.evals[d].meals.has(m)) continue;
        const ins = bestInsertion(sol, freeMealId(m, d), [d]);
        if (ins && ins.delta < 0) apply(sol, ins);
      }
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
  const flexibility = (id) =>
    ranges[id].reduce((a, rs) => a + rs.reduce((b, [lo, hi]) => b + hi - lo + 15, 0), 0) - (P[id].priority === "must" ? 1e6 : 0);

  function solve({ timeBudgetMs = 700, seed = Date.now() } = {}) {
    let s = seed >>> 0 || 1;
    const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const shuffle = (a) => {
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };

    const empty = () => makeSolution(Array.from({ length: nDays }, () => []));
    const order = places.map((p) => p.id).sort((a, b) => flexibility(a) - flexibility(b));
    let cur = polish(insertAll(empty(), order));
    let best = cur;
    const t0 = Date.now();
    // 온도는 비용 규모에 맞춘다 (옵션에 따라 비용 단위가 달라짐)
    let temp = 0.02 * Math.max(500, cur.cost);
    let iter = 0;

    while (Date.now() - t0 < timeBudgetMs && places.length > 1) {
      iter++;
      const seqs = cur.seqs.map((x) => [...x]);
      const scheduled = seqs.flat();
      let removed;
      const real = scheduled.filter((id) => !isFree(id));
      const r = rand();
      if (r < 0.4 && real.length > 2) {
        // 가까운 장소 묶음을 통째로 빼서 다른 날로 옮겨볼 수 있게 한다 (관련 장소 제거)
        const at = (id) => locs[id][0];
        const seedId = real[Math.floor(rand() * real.length)];
        const k = 3 + Math.floor(rand() * Math.min(6, real.length - 2));
        removed = [...real].sort((a, b) => distanceKm(at(a), at(seedId)) - distanceKm(at(b), at(seedId))).slice(0, k);
      } else {
        const k = 1 + Math.floor(rand() * Math.min(4, Math.max(1, scheduled.length)));
        removed = shuffle([...scheduled]).slice(0, k);
      }
      if (r > 0.85) {
        // 가끔은 하루를 통째로 비워 날짜 배정을 크게 바꿔본다
        const d = Math.floor(rand() * nDays);
        removed.push(...seqs[d]);
      }
      const rm = new Set(removed);
      const ruined = makeSolution(seqs.map((x) => x.filter((id) => !rm.has(id))));
      if (!ruined) {
        continue;
      }
      const pending = [...ruined.unscheduled].sort((a, b) => flexibility(a) - flexibility(b) + (rand() - 0.5) * 400);
      let cand = insertAll(ruined, pending);
      if (cand && cand.cost < best.cost) cand = polish(cand); // 지금까지보다 좋은 후보만 다듬는다

      if (cand.cost < cur.cost || rand() < Math.exp((cur.cost - cand.cost) / temp)) cur = cand;
      if (cur.cost < best.cost) best = cur;
      temp = Math.max(0.5, temp * 0.997);
    }
    return { ...best, iterations: iter };
  }

  function explain(id, sol) {
    const p = P[id];
    const feasibleAlone = [];
    for (let d = 0; d < nDays; d++) if (ranges[id][d].length && evalDay(d, [id])) feasibleAlone.push(d);
    if (!feasibleAlone.length) {
      if (p.pin && (p.pin.day != null || p.pin.time)) return "고정한 날짜·시간에는 넣을 수 없어요";
      if ((p.slots || []).length) return "지정한 공연·예약 시각에 맞출 수 없어요";
      if (ranges[id].every((r) => !r.length)) return "여행 기간에 영업시간(또는 식사 시간대)과 맞는 날이 없어요";
      return "하루 일정 시간 안에 다녀올 수 없어요 (거리·소요시간 확인)";
    }
    const meal = cat(p.category).meal;
    if (meal && feasibleAlone.every((d) => sol.seqs[d].some((q) => !isFree(q) && cat(P[q].category).meal))) {
      return "같은 식사 시간대에 다른 식당이 이미 있어요";
    }
    if (prefs.minTravel) return "이동 최소 모드라 동선에서 먼 곳은 뺐어요 (꼭 가기로 바꾸면 넣어요)";
    return "시간이 부족해요 — 다른 장소를 빼거나 하루 시간을 늘려보세요";
  }

  return { solve, explain, evalDay, expectedMeals, places: P };
}

// 추천: 빼면 이동이 크게 줄어드는 곳 / 보류 중이지만 동선에 거의 그대로 끼워 넣을 수 있는 곳
const SUGGEST_REMOVE_MIN = 15; // 이만큼 이상 줄어야 "빼기" 추천
const SUGGEST_ADD_MAX = 12; // 이만큼 이하로 늘어야 "추가" 추천
function suggest(trip, sol, opts) {
  const all = { ...trip, places: trip.places.map((p) => (p.deleted ? p : { ...p, selected: true, priority: p.priority === "extra" ? "want" : p.priority })) };
  const probe = createSolver(all, opts.wishes || [], opts.prefs || {});
  const P = probe.places;
  const original = Object.fromEntries(trip.places.map((p) => [p.id, p]));
  const remove = [];
  sol.seqs.forEach((seq, d) => {
    const base = probe.evalDay(d, seq);
    if (!base) return;
    for (const id of seq) {
      const p = original[id];
      if (!p || p.priority === "must" || !p.selected) continue; // 꼭 가기·요청으로 들어온 곳은 제외
      const ev = probe.evalDay(d, seq.filter((x) => x !== id));
      if (ev && base.travelSum - ev.travelSum >= SUGGEST_REMOVE_MIN) remove.push({ id, day: d, save: base.travelSum - ev.travelSum });
    }
  });
  const add = [];
  for (const p of trip.places) {
    if (p.deleted || p.selected || !P[p.id]) continue;
    let best = null;
    sol.seqs.forEach((seq, d) => {
      const base = probe.evalDay(d, seq);
      if (!base) return;
      for (let i = 0; i <= seq.length; i++) {
        // 적용할 때와 같은 기준(비용이 가장 낮은 자리)으로 고르고, 그 자리의 이동 증가를 보여준다
        const ev = probe.evalDay(d, [...seq.slice(0, i), p.id, ...seq.slice(i)]);
        if (ev && (!best || ev.cost - base.cost < best.dc)) best = { id: p.id, day: d, extra: ev.travelSum - base.travelSum, dc: ev.cost - base.cost };
      }
    });
    if (best && best.extra <= SUGGEST_ADD_MAX) add.push(best);
  }
  return {
    remove: remove.sort((a, b) => b.save - a.save).slice(0, 5),
    add: add.sort((a, b) => a.extra - b.extra).slice(0, 5).map(({ dc, ...x }) => x),
  };
}

// 추천을 적용: 전체를 다시 짜지 않고 그날 동선에서 장소 하나만 빼거나 가장 좋은 자리에 끼워 넣는다.
// (다시 짜면 빈 시간에 다른 곳이 채워져 추천에 적힌 만큼 줄지 않기 때문)
export function applySuggestion(trip, schedule, { type, id, day }, opts = {}) {
  const solver = createSolver(trip, opts.wishes || [], opts.prefs || {});
  const seqs = schedule.days.map((d) => d.items.map((it) => it.id).filter((x) => !(type === "remove" && x === id)));
  if (seqs.flat().some((x) => !solver.places[x])) return null; // 일정과 장소 목록이 어긋나면 다시 짜기
  const seq = seqs[day];
  let ev = null;
  if (type === "remove") {
    ev = solver.evalDay(day, seq);
  } else {
    for (let i = 0; i <= seq.length; i++) {
      const cand = [...seq.slice(0, i), id, ...seq.slice(i)];
      const e = solver.evalDay(day, cand);
      if (e && (!ev || e.cost < ev.cost)) [ev, seqs[day]] = [e, cand];
    }
  }
  if (!ev) return null;
  const days = schedule.days.map((d, i) =>
    i === day ? { items: ev.items, back: { travel: ev.back.min, mode: ev.back.mode }, missingMeals: solver.expectedMeals[i].filter((m) => !ev.meals.has(m)) } : d,
  );
  const travelOf = (d) => d.items.reduce((a, it) => a + it.travel, 0) + (d.back?.travel || 0);
  return {
    ...schedule,
    generatedAt: Date.now(),
    inputsKey: inputsKey(trip),
    days,
    unscheduled: schedule.unscheduled.filter((u) => u.id !== id),
    suggest: suggest(trip, { seqs }, opts),
    stats: { ...schedule.stats, travel: days.reduce((a, d) => a + travelOf(d), 0) },
  };
}

export function generateSchedule(trip, opts = {}) {
  const solver = createSolver(trip, opts.wishes || [], opts.prefs || {});
  // 한 번의 탐색은 국소 최적해에 갇히기 쉬워, 짧게 여러 번 다시 시작해 가장 좋은 결과를 쓴다
  const { timeBudgetMs = 2000, restarts = 5, seed = Date.now() } = opts;
  let sol = null;
  for (let r = 0; r < restarts; r++) {
    const cand = solver.solve({ timeBudgetMs: timeBudgetMs / restarts, seed: seed + r * 7919 });
    if (!sol || cand.cost < sol.cost) sol = cand;
  }
  return {
    generatedAt: Date.now(),
    inputsKey: inputsKey(trip),
    days: sol.evals.map((ev, d) => ({
      items: ev.items,
      back: { travel: ev.back.min, mode: ev.back.mode },
      missingMeals: solver.expectedMeals[d].filter((m) => !ev.meals.has(m)),
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

// 일정 결과에 영향을 주는 입력만 모은 문자열 — 바뀌면 "다시 만들기"를 권한다
export function inputsKey(trip) {
  const ps = trip.places
    .filter((p) => p.selected && !p.deleted)
    .map((p) => [p.id, p.lat, p.lon, p.category, p.duration, p.hours || "", p.priority, p.mealPref || "", p.before || "", JSON.stringify(p.slots || []), JSON.stringify(p.pin || {}), JSON.stringify(p.branches || [])].join("|"))
    .sort();
  const m = trip.meta;
  return JSON.stringify([m.startDate, m.hotel.lat, m.hotel.lon, m.days, ps, (m.requests || []).map((r) => r.text), m.prefs || {}]);
}
