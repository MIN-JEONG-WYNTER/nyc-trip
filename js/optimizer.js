// 선택한 장소들을 여행 기간 전체에 자동 배치한다.
// 하루는 호텔에서 출발해 호텔로 돌아오며, 고정 일정은 체크인(첫날 시작)·체크아웃(마지막 날 끝)뿐이다.
// 방식: 제약이 많은 곳부터 비용이 가장 적게 늘어나는 자리에 끼워 넣은 뒤,
//       일부를 빼고 다시 넣는(ruin & recreate) 과정을 반복하며 개선한다.
import { parseHours, toMin, weekdayOf } from "./hours.js";
import { cat, MEAL_WINDOWS } from "./categories.js";
import { travel } from "./geo.js";

const UNSCHEDULED_PENALTY = { must: 5000, want: 1000 };
const WAIT_WEIGHT = 0.25;
const BALANCE_WEIGHT = 0.3;

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
    ranges = [...intersect(ranges, MEAL_WINDOWS.lunch), ...intersect(ranges, MEAL_WINDOWS.dinner)];
  } else if (c.meal) {
    ranges = intersect(ranges, MEAL_WINDOWS[c.meal]);
  } else if (c.window) {
    ranges = intersect(ranges, c.window);
  }
  return intersect(ranges, [dayStart, dayEnd - dur]).sort((a, b) => a[0] - b[0]);
}

function mealOf(p, start) {
  const meal = cat(p.category).meal;
  if (!meal) return null;
  if (meal !== "any") return meal;
  return start < MEAL_WINDOWS.dinner[0] ? "lunch" : "dinner";
}

export function createSolver(trip) {
  const meta = trip.meta;
  const hotel = { lat: meta.hotel.lat, lon: meta.hotel.lon };
  const places = trip.places.filter((p) => p.selected && !p.deleted);
  const P = Object.fromEntries(places.map((p) => [p.id, p]));
  const nDays = meta.days.length;

  const ranges = {};
  for (const p of places) ranges[p.id] = Array.from({ length: nDays }, (_, d) => startRanges(p, d, meta));

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

  function evalDay(d, seq) {
    const day = meta.days[d];
    let t = toMin(day.start);
    let prev = hotel;
    let travelSum = 0;
    let waitSum = 0;
    const meals = new Set();
    const items = [];
    for (let i = 0; i < seq.length; i++) {
      const p = P[seq[i]];
      if (p.before && seq.indexOf(p.before) > -1 && seq.indexOf(p.before) < i) return null;
      const leg = tr(prev, p);
      const arrive = t + leg.min;
      let start = null;
      let meal = null;
      for (const [lo, hi] of ranges[p.id][d]) {
        if (hi < arrive) continue;
        const s = Math.max(lo, arrive);
        const m = mealOf(p, s);
        if (m && meals.has(m)) continue; // 점심이 이미 있으면 저녁 시간대로 넘긴다
        start = s;
        meal = m;
        break;
      }
      if (start == null) return null;
      if (meal) meals.add(meal);
      // 첫 장소 전 대기는 호텔에서 늦게 출발하면 되므로 대기로 치지 않는다
      const wait = i === 0 ? 0 : start - arrive;
      items.push({ id: p.id, start, end: start + p.duration, travel: leg.min, mode: leg.mode, wait });
      travelSum += leg.min;
      waitSum += wait;
      t = start + p.duration;
      prev = p;
    }
    const back = seq.length ? tr(prev, hotel) : { min: 0, mode: "none" };
    const dayEnd = toMin(day.end);
    if (t + back.min > dayEnd) return null;
    // 하루에 몰리지 않도록, 그날 쓸 수 있는 시간 대비 사용한 시간의 제곱에 비례해 비용을 더한다
    const used = items.length ? t + back.min - (items[0].start - items[0].travel) : 0;
    const balance = (BALANCE_WEIGHT * used * used) / Math.max(60, dayEnd - toMin(day.start));
    const cost = travelSum + back.min + WAIT_WEIGHT * waitSum + balance;
    return { items, back, travelSum: travelSum + back.min, waitSum, cost };
  }

  // 날짜 사이 제약(before 관계가 같은 날이어야 함)
  function dayAllowed(id, d, assign) {
    const p = P[id];
    if (p.before && assign[p.before] != null && assign[p.before] !== d) return false;
    for (const q of afterOf[id] || []) if (assign[q] != null && assign[q] !== d) return false;
    return ranges[id][d].length > 0;
  }

  const penalty = (id) => UNSCHEDULED_PENALTY[P[id].priority] ?? UNSCHEDULED_PENALTY.want;

  function makeSolution(seqs) {
    const evals = seqs.map((s, d) => evalDay(d, s));
    if (evals.some((e) => !e)) return null; // 장소를 빼면서 이동 경로가 오히려 길어져 하루를 넘긴 경우
    const assign = {};
    seqs.forEach((s, d) => s.forEach((id) => (assign[id] = d)));
    const unscheduled = places.map((p) => p.id).filter((id) => assign[id] == null);
    const cost = evals.reduce((a, e) => a + e.cost, 0) + unscheduled.reduce((a, id) => a + penalty(id), 0);
    return { seqs, evals, assign, unscheduled, cost };
  }

  function bestInsertion(sol, id) {
    let best = null;
    for (let d = 0; d < nDays; d++) {
      if (!dayAllowed(id, d, sol.assign)) continue;
      const seq = sol.seqs[d];
      for (let i = 0; i <= seq.length; i++) {
        const cand = [...seq.slice(0, i), id, ...seq.slice(i)];
        const ev = evalDay(d, cand);
        if (!ev) continue;
        const delta = ev.cost - sol.evals[d].cost;
        if (!best || delta < best.delta) best = { d, seq: cand, ev, delta };
      }
    }
    return best;
  }

  function insertAll(sol, ids) {
    for (const id of ids) {
      const ins = bestInsertion(sol, id);
      if (!ins) continue;
      sol.seqs[ins.d] = ins.seq;
      sol.evals[ins.d] = ins.ev;
      sol.assign[id] = ins.d;
    }
    return makeSolution(sol.seqs);
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
    let cur = insertAll(empty(), order);
    let best = cur;
    const t0 = Date.now();
    let temp = 30;
    let iter = 0;

    while (Date.now() - t0 < timeBudgetMs && places.length > 1) {
      iter++;
      const seqs = cur.seqs.map((x) => [...x]);
      const scheduled = seqs.flat();
      const k = 1 + Math.floor(rand() * Math.min(4, Math.max(1, scheduled.length)));
      const removed = shuffle([...scheduled]).slice(0, k);
      if (rand() < 0.15) {
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
      const cand = insertAll(ruined, pending);

      if (cand.cost < cur.cost || rand() < Math.exp((cur.cost - cand.cost) / temp)) cur = cand;
      if (cur.cost < best.cost) best = cur;
      temp = Math.max(0.5, temp * 0.995);
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
    if (meal && feasibleAlone.every((d) => sol.seqs[d].some((q) => cat(P[q].category).meal))) {
      return "같은 식사 시간대에 다른 식당이 이미 있어요";
    }
    return "시간이 부족해요 — 다른 장소를 빼거나 하루 시간을 늘려보세요";
  }

  return { solve, explain, evalDay, places: P };
}

export function generateSchedule(trip, opts = {}) {
  const solver = createSolver(trip);
  const sol = solver.solve(opts);
  return {
    generatedAt: Date.now(),
    inputsKey: inputsKey(trip),
    days: sol.evals.map((ev) => ({ items: ev.items, back: { travel: ev.back.min, mode: ev.back.mode } })),
    unscheduled: sol.unscheduled.map((id) => ({ id, reason: solver.explain(id, sol) })),
    stats: {
      travel: sol.evals.reduce((a, e) => a + e.travelSum, 0),
      wait: sol.evals.reduce((a, e) => a + e.waitSum, 0),
      iterations: sol.iterations,
    },
  };
}

// 일정 결과에 영향을 주는 입력만 모은 문자열 — 바뀌면 "다시 만들기"를 권한다
export function inputsKey(trip) {
  const ps = trip.places
    .filter((p) => p.selected && !p.deleted)
    .map((p) => [p.id, p.lat, p.lon, p.category, p.duration, p.hours || "", p.priority, p.before || "", JSON.stringify(p.slots || []), JSON.stringify(p.pin || {})].join("|"))
    .sort();
  const m = trip.meta;
  return JSON.stringify([m.startDate, m.hotel.lat, m.hotel.lon, m.days, ps]);
}
