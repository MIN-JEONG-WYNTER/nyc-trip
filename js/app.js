import { Store, REPO, mergeTrips, activeRequests } from "./store.js";
import { CATEGORIES, CUISINES, MEAL_SLOTS, cat, kindOf } from "./categories.js";
import { DISTRICTS } from "./areas.js";
import { parseHours, describeHours, fmtMin, toMin, weekdayOf } from "./hours.js";
import { generateSchedule, applySuggestion, inputsKey, tripDate } from "./optimizer.js";
import { parseRequest, describeRule, applyRequests, REQUEST_HINT } from "./requests.js";
import { searchPlaces, reverseGeocode, lookupHours, findBranches, fillBranchHours } from "./search.js";

const store = new Store();
const $ = (sel) => document.querySelector(sel);
const num = (v) => (Number.isFinite(+v) ? +v : 0);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const WEEK_EN = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const MEAL_PREF = { breakfast: "아침만", lunch: "점심만", dinner: "저녁만" };
const MODE = { walk: "🚶 도보", subway: "🚇 지하철", none: "📍 바로 옆" };

const ui = { view: "plan", day: null, filter: "all", draft: null, picking: false };

const trip = () => store.trip;
const livePlaces = () => trip().places.filter((p) => !p.deleted);
const placeById = (id) => trip().places.find((p) => p.id === id);
// 일정 화면용: 삭제된 장소는 다시 만들기 전이라도 보이지 않게
const livePlaceById = (id) => {
  const p = placeById(id);
  return p && !p.deleted ? p : null;
};
const newId = () => `p-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function toast(msg, ms = 2200) {
  const el = $("#toast");
  const host = $("#sheet")?.open ? $("#sheet") : document.body;
  if (el.parentElement !== host) host.appendChild(el);
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), ms);
}

const fmtDur = (min) => (min >= 60 ? `${Math.floor(min / 60)}시간${min % 60 ? ` ${min % 60}분` : ""}` : `${min}분`);
// 하루 이동 합계 (도보·지하철 따로)
function dayTravel(day) {
  const legs = [...day.items.map((it) => ({ min: num(it.travel), mode: it.mode })), { min: num(day.back?.travel), mode: day.back?.mode }];
  const sum = (m) => legs.filter((l) => l.mode === m).reduce((a, l) => a + l.min, 0);
  return { walk: sum("walk"), subway: sum("subway"), total: legs.reduce((a, l) => a + l.min, 0) };
}
const travelText = (t) => `${fmtDur(t.total)}${t.total ? ` (🚶 ${fmtDur(t.walk)} · 🚇 ${fmtDur(t.subway)})` : ""}`;

const dayLabel = (d) => {
  const date = tripDate(trip().meta, d);
  return `${date.getMonth() + 1}/${date.getDate()} · ${WEEK_EN[weekdayOf(date)]}`;
};

// 뉴욕 현지 날짜·시각 (여행 중 "오늘"과 "지금" 표시용)
function nycNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  const [y, m, d] = trip().meta.startDate.split("-").map(Number);
  const dayIdx = Math.round((Date.UTC(+parts.year, +parts.month - 1, +parts.day) - Date.UTC(y, m - 1, d)) / 864e5);
  return { dayIdx, min: +parts.hour * 60 + +parts.minute };
}

function hoursInfo(p) {
  if ((p.slots || []).length) return { label: "정해진 시각에만", text: p.slots.map((x) => x.time).join(", "), ok: true };
  const week = parseHours(p.hours);
  if (week) return { label: { osm: "영업시간 OSM", google: "영업시간 구글" }[p.hoursSource] || "영업시간 직접 입력", text: describeHours(week), ok: true };
  if (p.hours) return { label: "영업시간 해석 불가 → 기본값", text: p.hours, ok: false };
  const def = cat(p.category).hours.map(([o, c]) => `${fmtMin(o)}–${fmtMin(c)}`).join(", ");
  return { label: "영업시간 정보 없음 → 기본값", text: `기본값 ${def}`, ok: false };
}

// 일정 항목이 실제로 가는 지점 (분점이 골라졌으면 그 분점)
const locOf = (p, it) => {
  const b = it?.branch ? p.branches?.[it.branch - 1] : null;
  return b ? { lat: b.lat, lon: b.lon, label: b.label } : { lat: p.lat, lon: p.lon, label: p.addr || "" };
};
const gmapsUrl = (p, loc = p) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name.split(/[·(]/)[0].trim()} ${loc.lat},${loc.lon}`)}`;
// 체인일 수 있는 종류 — 추가할 때 분점을 같이 찾는다
const BRANCHY = new Set(["restaurant", "cafe", "bar", "shop"]);

async function attachBranches(id) {
  const p = placeById(id);
  const found = await findBranches(p, trip().meta.hotel).catch(() => null);
  if (!found) return null;
  const branches = found.length ? await fillBranchHours(found) : [];
  const cur = livePlaceById(id);
  if (!cur || cur.branches?.length) return 0; // 그 사이 지워졌거나 직접 분점을 정했으면 두기
  store.updatePlace(id, { branches, branchesCheckedAt: Date.now() });
  return branches.length;
}

// ---------------- 지도 ----------------
const tiles = () => L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors" });
const numIcon = (html, extra = "") => L.divIcon({ className: `num-marker ${extra}`, html: `<span>${html}</span>`, iconSize: [24, 24], iconAnchor: [12, 12] });

const planMap = L.map("planMap", { scrollWheelZoom: false }).setView([40.735, -73.995], 12);
tiles().addTo(planMap);
const planLayer = L.layerGroup().addTo(planMap);

const placesMap = L.map("placesMap", { scrollWheelZoom: false }).setView([40.735, -73.995], 12);
tiles().addTo(placesMap);
const placesLayer = L.layerGroup().addTo(placesMap);

// ---------------- 상단 / 내비게이션 ----------------
function renderHeader() {
  const chip = $("#syncChip");
  chip.dataset.status = store.status;
  const text = {
    local: "● 이 폰에만 저장",
    syncing: "● 동기화 중…",
    synced: store.canWrite ? `● 공유 중 · ${store.user}` : "● GitHub 미연결 · 수정은 이 폰에만",
    error: `● 동기화 오류${store.error ? ` · ${store.error}` : ""}`,
  }[store.status];
  chip.textContent = text;
  const n = livePlaces().filter((p) => p.selected).length;
  $("#placeCount").textContent = `${n}/${livePlaces().length}`;
  const m = trip().meta;
  const first = tripDate(m, 0);
  const last = tripDate(m, m.days.length - 1);
  const mon = first.toLocaleString("en-US", { month: "long" });
  $("#heroDates").textContent = `${mon} ${first.getDate()}–${last.getDate()}, ${first.getFullYear()} · ${m.days.length} DAYS / ${m.days.length - 1} NIGHTS`;
}

function setView(view) {
  if (view !== "places" && ui.picking) stopPicking(false); // 다른 탭으로 가면 위치 고르기 취소
  ui.view = view;
  document.querySelectorAll(".nav").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${view}`));
  render();
  setTimeout(() => {
    planMap.invalidateSize();
    placesMap.invalidateSize();
    if (view === "plan") drawPlanMap();
    if (view === "places") drawPlacesMap(true);
  }, 0);
}

// ---------------- 일정 ----------------
function renderPlan() {
  const t = trip();
  renderRequests();
  document.querySelectorAll("#prefChips [data-pref]").forEach((b) => b.classList.toggle("active", !!t.meta.prefs?.[b.dataset.pref]));
  const sch = t.schedule;
  const nDays = t.meta.days.length;
  const now = nycNow();
  if (ui.day == null || ui.day >= nDays) ui.day = now.dayIdx >= 0 && now.dayIdx < nDays ? now.dayIdx : 0;

  $("#dayTabs").innerHTML = t.meta.days
    .map((_, d) => `<button class="tab ${d === ui.day ? "active" : ""}" data-day="${d}">${dayLabel(d)}${d === now.dayIdx ? '<i class="today"></i>' : ""}</button>`)
    .join("");

  $("#staleNotice").hidden = !sch || sch.inputsKey === inputsKey(t);
  $("#generateBtn").textContent = sch ? "✨ 일정 다시 만들기" : "✨ 일정 자동 생성";

  if (!sch) {
    $("#planStats").textContent = "";
    $("#dayHead").innerHTML = "";
    $("#timeline").innerHTML = `<div class="empty">아직 만든 일정이 없어요.<br>‘장소’ 탭에서 갈 곳을 고른 뒤 <b>일정 자동 생성</b>을 눌러주세요.</div>`;
    $("#unscheduled").innerHTML = "";
    return;
  }

  const by = sch.by ? ` · ${esc(sch.by)}` : "";
  const when = new Date(sch.generatedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const all = sch.days.map(dayTravel).reduce((a, x) => ({ walk: a.walk + x.walk, subway: a.subway + x.subway, total: a.total + x.total }), { walk: 0, subway: 0, total: 0 });
  $("#planStats").innerHTML = `<b>전체 이동 ${travelText(all)}</b><br>${when} 생성${by}`;

  const d = ui.day;
  const day = sch.days[d] || { items: [], back: { travel: 0 } };
  const win = t.meta.days[d];
  const names = day.items.map((it) => livePlaceById(it.id)?.name).filter(Boolean);
  const missing = (day.missingMeals || []).map((m) => MEAL_SLOTS[m]?.label).filter(Boolean);
  $("#dayHead").innerHTML = `<h2>DAY ${d + 1} · ${esc(dayLabel(d))}</h2><p>${names.length ? esc(names.slice(0, 3).join(" → ")) + (names.length > 3 ? " …" : "") : "아직 배정된 곳이 없어요"}</p>
    ${day.items.length ? `<span class="pill">🧭 이날 이동 ${travelText(dayTravel(day))}</span>` : ""}
    ${day.districts?.length ? `<span class="pill">📍 ${day.districts.map((k) => esc(DISTRICTS[k]?.label || "외곽")).join(" + ")}</span>` : ""}
    ${t.meta.prefs?.maxDaily && dayTravel(day).subway > t.meta.prefs.maxDaily ? `<span class="pill warn">⏱ 지하철 ${t.meta.prefs.maxDaily}분 초과 — 꼭 가기·시간 고정 일정 때문에 더 줄일 수 없어요</span>` : ""}
    ${missing.length ? `<span class="pill warn">⚠️ ${missing.join("·")} 먹을 시간이 없어요</span>` : ""}`;

  const rows = [];
  const firstLeave = day.items.length ? day.items[0].start - day.items[0].travel : toMin(win.start);
  rows.push(anchorRow(d === 0 ? fmtMin(toMin(win.start)) : fmtMin(firstLeave), d === 0 ? "🏨 체크인" : "🏨 호텔 출발", trip().meta.hotel.name));

  let order = 0;
  day.items.forEach((it) => {
    const legText = it.travel ? `${MODE[it.mode] || ""} 약 ${num(it.travel)}분` : "";
    const waitText = num(it.wait) >= 15 ? ` · ⏳ 여유 ${num(it.wait)}분` : "";
    const isNow = now.dayIdx === d && now.min >= it.start && now.min < it.end;
    if (it.freeMeal) {
      rows.push(`
      <div class="item free ${isNow ? "now" : ""}">
        ${waitText ? `<div></div><div class="leg">${waitText.slice(3)}</div>` : ""}
        <div class="time"><div class="dot"></div>${fmtMin(it.start)}<small>~${fmtMin(it.end)}</small></div>
        <div class="card">
          <div class="type">🍽 ${esc(MEAL_SLOTS[it.freeMeal]?.label || "식사")} · 자유 식사${isNow ? " · 지금" : ""}</div>
          <h3>${esc(MEAL_SLOTS[it.freeMeal]?.label || "식사")} — 근처에서 자유롭게</h3>
          <p>정해둔 식당이 없는 끼니예요. ‘장소’에서 식당을 추가하면 이 자리에 들어가요.</p>
        </div>
      </div>`);
      return;
    }
    const p = livePlaceById(it.id);
    if (!p) return;
    const i = order++;
    const c = kindOf(p);
    const pinned = p.pin && (p.pin.day != null || p.pin.time);
    const hi = hoursInfo(p);
    rows.push(`
      <div class="item ${isNow ? "now" : ""}">
        ${legText || waitText ? `<div></div><div class="leg">${legText}${waitText}</div>` : ""}
        <div class="time"><div class="dot"></div>${fmtMin(it.start)}<small>~${fmtMin(it.end)}</small></div>
        <div class="card">
          <div class="type">${c.icon} ${esc(c.label)}${isNow ? " · 지금" : ""}</div>
          <h3>${i + 1}. ${esc(p.name)}</h3>
          ${p.branches?.length ? `<p>📍 ${esc(locOf(p, it).label || "기본 지점")} <small>(지점 ${p.branches.length + 1}곳 중 동선에 맞춰 선택)</small></p>` : ""}
          ${p.note ? `<p>${esc(p.note)}</p>` : ""}
          ${p.priority === "must" ? '<span class="pill must">꼭 가기</span>' : ""}
          ${pinned ? '<span class="pill pin">📌 고정</span>' : ""}
          ${hi.ok ? "" : '<span class="pill warn">영업시간 미확인</span>'}
          <div class="card-actions">
            <button data-act="pin" data-id="${esc(p.id)}" data-start="${num(it.start)}">${pinned ? "고정 해제" : "📌 이 시간 고정"}</button>
            <button data-act="edit" data-id="${esc(p.id)}">편집</button>
            <a href="${esc(gmapsUrl(p, locOf(p, it)))}" target="_blank" rel="noopener">구글 지도</a>
          </div>
        </div>
      </div>`);
  });

  const lastEnd = day.items.length ? num(day.items[day.items.length - 1].end) + num(day.back.travel) : null;
  const isLast = d === t.meta.days.length - 1;
  const backLeg = day.items.length && day.back.travel ? `${MODE[day.back.mode] || ""} 약 ${num(day.back.travel)}분` : "";
  rows.push(
    anchorRow(
      isLast ? win.end : lastEnd != null ? fmtMin(lastEnd) : "",
      isLast ? "🧳 체크아웃" : "🏨 호텔 복귀",
      isLast && lastEnd != null ? `호텔 도착 ${fmtMin(lastEnd)}` : "",
      backLeg,
    ),
  );
  $("#timeline").innerHTML = rows.join("");

  renderSuggestions(sch);
  const un = sch.unscheduled.filter((u) => placeById(u.id) && !placeById(u.id).deleted);
  $("#unscheduled").innerHTML = un.length
    ? `<div class="map-title"><h3>🙅 이번 일정에 못 넣은 곳</h3><span>${un.length}곳</span></div>` +
      un
        .map((u) => {
          const p = placeById(u.id);
          return `<div class="card"><div class="type">${kindOf(p).icon} ${esc(kindOf(p).label)}</div><h3>${esc(p.name)}</h3><p>${esc(u.reason)}</p>
            <div class="card-actions"><button data-act="edit" data-id="${esc(p.id)}">편집</button></div></div>`;
        })
        .join("")
    : "";
}

// 이동 줄이기 추천 (일정 만들 때 계산해 둔 것)
function renderSuggestions(sch) {
  const sg = sch.suggest;
  const live = (x) => placeById(x.id) && !placeById(x.id).deleted;
  const remove = (sg?.remove || []).filter((x) => live(x) && placeById(x.id).selected);
  const add = (sg?.add || []).filter((x) => live(x) && !placeById(x.id).selected);
  if (!remove.length && !add.length) {
    $("#suggestions").innerHTML = "";
    return;
  }
  const row = (x, text, act, label) => {
    const p = placeById(x.id);
    return `<div class="sg"><div class="body"><b>${kindOf(p).icon} ${esc(p.name)}</b><small>${text}</small></div>
      <button data-sg="${act}" data-id="${esc(p.id)}">${label}</button></div>`;
  };
  $("#suggestions").innerHTML = `<div class="map-title"><h3>💡 이동 줄이기 추천</h3><span>하나씩 적용했을 때 기준</span></div>
    ${remove.length ? `<div class="sg-title">빼면 이동이 줄어드는 곳</div>` + remove.map((x) => row(x, `DAY ${num(x.day) + 1}에서 빼면 이동 <b>−${num(x.save)}분</b>`, "hold", "보류로")).join("") : ""}
    ${add.length ? `<div class="sg-title">동선에 거의 그대로 들어가는 보류 장소</div>` + add.map((x) => row(x, `DAY ${num(x.day) + 1} 동선에 넣어도 이동 <b>+${num(x.extra)}분</b>`, "pick", "갈 곳으로")).join("") : ""}`;
}

$("#suggestions").addEventListener("click", (e) => {
  const b = e.target.closest("[data-sg]");
  if (!b) return;
  const p = placeById(b.dataset.id);
  const pick = b.dataset.sg === "pick";
  const sg = (trip().schedule.suggest?.[pick ? "add" : "remove"] || []).find((x) => x.id === p.id);
  store.updatePlace(p.id, { selected: pick });
  const { input, opts } = planInput();
  const next = sg && applySuggestion(input, trip().schedule, { type: pick ? "add" : "remove", id: p.id, day: sg.day }, opts);
  if (next) next.inputsKey = inputsKey(trip());
  if (!next) return runGenerate(); // 그대로 적용할 수 없으면 다시 짠다
  store.update((t) => (t.schedule = { ...next, by: store.user }));
  ui.day = sg.day;
  render();
  drawPlanMap();
  toast(pick ? `‘${p.name}’을(를) DAY ${sg.day + 1}에 넣었어요 (+${sg.extra}분)` : `‘${p.name}’을(를) 보류로 돌렸어요 (−${sg.save}분)`);
});

function anchorRow(time, title, sub, leg = "") {
  return `<div class="item anchor">
    ${leg ? `<div></div><div class="leg">${leg}</div>` : ""}
    <div class="time"><div class="dot"></div>${esc(time)}</div>
    <div class="card"><h3>${esc(title)}</h3>${sub ? `<p>${esc(sub)}</p>` : ""}</div></div>`;
}

function drawPlanMap() {
  planLayer.clearLayers();
  const t = trip();
  const hotel = [t.meta.hotel.lat, t.meta.hotel.lon];
  L.marker(hotel, { icon: numIcon("🏨", "hotel") }).bindPopup(esc(t.meta.hotel.name)).addTo(planLayer);
  const day = t.schedule?.days[ui.day];
  if (!day || !day.items.length) {
    planMap.setView(hotel, 13);
    return;
  }
  const pts = [hotel];
  let order = 0;
  day.items.forEach((it) => {
    const p = livePlaceById(it.id);
    if (!p) return;
    const i = order++;
    const loc = locOf(p, it);
    pts.push([loc.lat, loc.lon]);
    L.marker([loc.lat, loc.lon], { icon: numIcon(i + 1) })
      .bindPopup(`<b>${i + 1}. ${esc(p.name)}</b><br>${fmtMin(it.start)}–${fmtMin(it.end)}`)
      .addTo(planLayer);
  });
  pts.push(hotel);
  const line = L.polyline(pts, { weight: 4, opacity: 0.7, color: "#111" }).addTo(planLayer);
  planMap.fitBounds(line.getBounds(), { padding: [30, 30] });
}

$("#dayTabs").addEventListener("click", (e) => {
  const b = e.target.closest(".tab");
  if (!b) return;
  ui.day = +b.dataset.day;
  renderPlan();
  drawPlanMap();
});

// 문장 요청을 반영한 일정 입력과 옵션 (일정 생성·추천 적용에서 같이 씀)
function planInput() {
  const { trip: input, wishes } = applyRequests(trip(), activeRequests(trip()));
  const excludedIds = new Set(input.places.filter((p) => !p.deleted && !p.selected).map((p) => p.id).filter((id) => placeById(id)?.selected));
  // 요청 때문에 들어온 곳 (원래는 보류인데 요청으로 선택됨)
  const forcedIds = new Set(input.places.filter((p) => !p.deleted && p.selected && !placeById(p.id)?.selected).map((p) => p.id));
  return { input, opts: { wishes, prefs: trip().meta.prefs || {}, inputsKey: inputsKey(trip()), excludedIds, forcedIds } };
}

function renderRequests() {
  const reqs = activeRequests(trip());
  const unmet = reqs.length ? trip().schedule?.unmet || [] : [];
  $("#requestList").innerHTML = reqs
    .map((r) => {
      const rules = parseRequest(r.text, trip());
      const how = rules.length
        ? `<small>${rules.map((x) => esc(describeRule(x, trip()))).join("<br>")}</small>`
        : `<small class="bad">이해하지 못했어요. 날짜·동네·종류·장소 이름을 넣어 다시 적어주세요.</small>`;
      return `<div class="req"><div class="body">“${esc(r.text)}”${how}</div><button data-delreq="${esc(r.id)}" aria-label="요청 삭제">✕</button></div>`;
    })
    .join("") +
    (unmet.length ? `<div class="req warn"><div class="body">⚠️ 이번 일정에서 못 지킨 요청<small>${unmet.map(esc).join("<br>")}</small></div></div>` : "");
}

$("#requestForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = $("#requestInput").value.trim();
  if (!text) return;
  if (!parseRequest(text, trip()).length) return toast("이해하지 못했어요 · 예: ‘둘째날 오후는 첼시에서 빈티지 쇼핑’", 3500);
  store.addRequest(text, { by: store.user });
  $("#requestInput").value = "";
  runGenerate();
});
$("#requestList").addEventListener("click", (e) => {
  const b = e.target.closest("[data-delreq]");
  if (!b) return;
  store.removeRequest(b.dataset.delreq);
  runGenerate();
});

$("#generateBtn").addEventListener("click", () => runGenerate());

// 이동 옵션 (두 사람이 같은 설정을 쓰도록 공유 데이터에 저장)
$("#prefChips").addEventListener("click", (e) => {
  const b = e.target.closest("[data-pref]");
  if (!b) return;
  const key = b.dataset.pref;
  const on = b.dataset.value ? +b.dataset.value : true;
  store.setPref(key, trip().meta.prefs?.[key] ? false : on);
  toast(trip().meta.prefs[key] ? `${b.textContent.trim()} 켬 · 다시 짜는 중…` : `${b.textContent.trim()} 끔 · 다시 짜는 중…`);
  runGenerate();
});

function runGenerate() {
  const selected = livePlaces().filter((p) => p.selected);
  if (!selected.length && !activeRequests(trip()).length) {
    toast("‘장소’ 탭에서 갈 곳을 먼저 골라주세요");
    return;
  }
  const btn = $("#generateBtn");
  btn.disabled = true;
  btn.textContent = "⏳ 계산 중…";
  setTimeout(() => {
    const { input, opts } = planInput();
    const sch = generateSchedule(input, { timeBudgetMs: 2000, ...opts });
    sch.inputsKey = inputsKey(trip());
    store.update((t) => (t.schedule = { ...sch, by: store.user }));
    btn.disabled = false;
    toast(sch.unscheduled.length ? `일정을 만들었어요 · ${sch.unscheduled.length}곳은 못 넣었어요` : "일정을 만들었어요 ✨");
    drawPlanMap();
  }, 30);
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const p = placeById(b.dataset.id);
  if (!p) return;
  if (b.dataset.act === "edit") openSheet(p);
  if (b.dataset.act === "pin") {
    const pinned = p.pin && (p.pin.day != null || p.pin.time);
    store.updatePlace(p.id, { pin: pinned ? { day: null, time: null } : { day: ui.day, time: fmtMin(+b.dataset.start) } });
    toast(pinned ? "고정을 풀었어요" : "이 날짜·시간으로 고정했어요. 다시 만들어도 유지돼요");
  }
});

// ---------------- 장소 ----------------
function renderPlaces() {
  const list = livePlaces().filter((p) =>
    ui.filter === "selected" ? p.selected : ui.filter === "unselected" ? !p.selected : ui.filter === "must" ? p.priority === "must" : true,
  );
  document.querySelectorAll("#placeFilter .chip").forEach((c) => c.classList.toggle("active", c.dataset.filter === ui.filter));
  if (!list.length) {
    $("#placeList").innerHTML =
      ui.filter === "must"
        ? `<div class="empty">꼭 갈 곳이 없어요. 장소를 눌러 ‘꼭 가기’를 체크하세요.</div>`
        : `<div class="empty">장소가 없어요. 위에서 검색해 추가해보세요.</div>`;
    return;
  }
  const groupKey = (p) => (p.category === "restaurant" ? `food:${CUISINES[p.cuisine] ? p.cuisine : "other"}` : p.category);
  const groupInfo = (k) => (k.startsWith("food:") ? CUISINES[k.slice(5)] : CATEGORIES[k]);
  const groups = Object.create(null);
  for (const p of list) (groups[groupKey(p)] ||= []).push(p);
  const order = [...Object.keys(CUISINES).map((c) => `food:${c}`), ...Object.keys(CATEGORIES).filter((k) => k !== "restaurant")];
  $("#placeList").innerHTML = order
    .filter((k) => groups[k])
    .map(
      (k) =>
        `<div class="group-title">${groupInfo(k).icon} ${esc(groupInfo(k).label)}</div>` +
        groups[k]
          .map((p) => {
            const hi = hoursInfo(p);
            const pinned = p.pin && (p.pin.day != null || p.pin.time);
            const extra = [p.priority === "must" ? "꼭 가기" : "", p.category === "restaurant" && MEAL_PREF[p.mealPref] ? MEAL_PREF[p.mealPref] : "", pinned ? "📌 고정" : "", (p.slots || []).length ? `🎫 ${p.slots.length}개 시각` : "", p.branches?.length ? `지점 ${p.branches.length + 1}곳` : ""].filter(Boolean).join(" · ");
            return `<div class="place ${p.selected ? "" : "off"}">
              <button class="check ${p.selected ? "on" : ""}" data-toggle="${esc(p.id)}" aria-label="갈 곳으로 선택">${p.selected ? "✓" : ""}</button>
              <div class="info" data-open="${esc(p.id)}"><b>${esc(p.name)}</b><span>${num(p.duration)}분 · ${esc(hi.label)}${extra ? ` · ${esc(extra)}` : ""}</span></div>
            </div>`;
          })
          .join(""),
    )
    .join("");
}

function drawPlacesMap(fit = false) {
  placesLayer.clearLayers();
  const t = trip();
  L.marker([t.meta.hotel.lat, t.meta.hotel.lon], { icon: numIcon("🏨", "hotel") }).bindPopup(esc(t.meta.hotel.name)).addTo(placesLayer);
  const pts = [];
  for (const p of livePlaces()) {
    pts.push([p.lat, p.lon]);
    for (const b of p.branches || [])
      L.circleMarker([b.lat, b.lon], { radius: 5, weight: 2, color: p.selected ? "#111" : "#aaa", fillColor: "#fff", fillOpacity: 1 })
        .bindTooltip(`${esc(p.name)} 분점`)
        .addTo(placesLayer);
    L.circleMarker([p.lat, p.lon], { radius: 8, weight: 2, color: "#fff", fillColor: p.selected ? "#111" : "#aaa", fillOpacity: 1 })
      .bindTooltip(esc(p.name))
      .on("click", () => !ui.picking && openSheet(p))
      .addTo(placesLayer);
  }
  if (fit && pts.length) placesMap.fitBounds(pts, { padding: [30, 30], maxZoom: 14 });
}

$("#placeList").addEventListener("click", (e) => {
  const tg = e.target.closest("[data-toggle]");
  if (tg) {
    const p = placeById(tg.dataset.toggle);
    store.updatePlace(p.id, { selected: !p.selected });
    return;
  }
  const op = e.target.closest("[data-open]");
  if (op) openSheet(placeById(op.dataset.open));
});

$("#placeFilter").addEventListener("click", (e) => {
  const c = e.target.closest(".chip");
  if (!c) return;
  ui.filter = c.dataset.filter;
  renderPlaces();
});

// 검색
let searchCtl = null;
let searchTimer = null;
let lastResults = [];
$("#searchInput").addEventListener("input", (e) => {
  const q = e.target.value.trim();
  clearTimeout(searchTimer);
  if (q.length < 2) {
    $("#searchResults").hidden = true;
    return;
  }
  searchTimer = setTimeout(() => runSearch(q), 350);
});
$("#searchInput").addEventListener("keydown", (e) => {
  if (e.key === "Escape") $("#searchResults").hidden = true;
  if (e.key === "Enter") {
    clearTimeout(searchTimer);
    const q = e.target.value.trim();
    if (q.length >= 2) runSearch(q);
  }
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".search")) $("#searchResults").hidden = true;
});

async function runSearch(q) {
  searchCtl?.abort();
  searchCtl = new AbortController();
  const box = $("#searchResults");
  box.hidden = false;
  box.innerHTML = `<div class="msg">검색 중…</div>`;
  try {
    lastResults = await searchPlaces(q, { signal: searchCtl.signal });
    renderResults();
  } catch (err) {
    if (err.name === "AbortError") return;
    box.innerHTML = `<div class="msg">검색에 실패했어요. 잠시 후 다시 시도해주세요.</div>`;
  }
}

function renderResults() {
  const box = $("#searchResults");
  if (!lastResults.length) {
    box.innerHTML = `<div class="msg">결과가 없어요. 영어 이름으로 검색하거나 ‘직접 추가’로 지도에서 위치를 찍어주세요.</div>`;
    return;
  }
  box.innerHTML = lastResults
    .map((r, i) => {
      const exists = livePlaces().some((p) => p.osm && r.osm && p.osm.type === r.osm.type && p.osm.id === r.osm.id);
      return `<div class="result"><div class="info"><b>${cat(r.category).icon} ${esc(r.name)}</b><span>${esc(r.kind || "")} · ${esc(r.addr)}</span></div>
        <button data-add="${i}" ${exists ? "disabled" : ""}>${exists ? "추가됨" : "＋ 추가"}</button></div>`;
    })
    .join("");
}

$("#searchResults").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-add]");
  if (!b) return;
  e.stopPropagation();
  const r = lastResults[+b.dataset.add];
  const id = newId();
  store.addPlace(blankPlace({ id, name: r.name, lat: r.lat, lon: r.lon, category: r.category, osm: r.osm, addr: r.addr }));
  renderResults();
  toast(`‘${r.name}’ 추가 · 영업시간 찾는 중…`);
  const found = await lookupHours(placeById(id)).catch(() => null);
  const now = livePlaceById(id); // 조회하는 사이 삭제·수정됐을 수 있다
  if (!now) return;
  if (found?.cuisine && now.category === "restaurant" && (!now.cuisine || now.cuisine === "other")) store.updatePlace(id, { cuisine: found.cuisine });
  if (found?.hours && !now.hours) {
    store.updatePlace(id, { hours: found.hours, hoursSource: "osm", osm: found.osm, ...(now.website ? {} : { website: found.website || null }) });
    toast(`‘${r.name}’ 영업시간을 OSM에서 가져왔어요`);
  } else if (!now.hours) {
    toast(`‘${r.name}’ 영업시간 정보가 없어 기본값을 써요 (편집에서 입력 가능)`, 3200);
  }
  if (BRANCHY.has(now.category) && !now.branches?.length) {
    const n = await attachBranches(id);
    if (n) toast(`‘${r.name}’ 분점 ${n}곳도 찾았어요 · 일정 만들 때 동선에 맞는 곳으로 골라요`, 3500);
  }
});

function blankPlace(fields) {
  const c = cat(fields.category || "restaurant");
  return {
    id: newId(),
    name: "",
    lat: trip().meta.hotel.lat,
    lon: trip().meta.hotel.lon,
    category: "restaurant",
    duration: c.dur,
    hours: null,
    hoursSource: null,
    slots: [],
    pin: { day: null, time: null },
    before: null,
    priority: "want",
    selected: true,
    note: "",
    osm: null,
    ...fields,
  };
}

$("#addManualBtn").addEventListener("click", () => openSheet(blankPlace({}), true));

$("#lookupAllBtn").addEventListener("click", async (e) => {
  const targets = livePlaces().filter((p) => !p.hours || (p.category === "restaurant" && !p.cuisine) || (BRANCHY.has(p.category) && !p.branchesCheckedAt));
  if (!targets.length) return toast("더 찾을 정보가 없어요");
  e.target.disabled = true;
  let found = 0;
  let branches = 0;
  for (const [i, p] of targets.entries()) {
    e.target.textContent = `🕐 찾는 중… ${i + 1}/${targets.length}`;
    const r = await lookupHours(p).catch(() => null);
    const cur = livePlaceById(p.id); // 조회하는 사이 바뀐 값을 기준으로
    if (!cur) continue;
    if (r?.cuisine && cur.category === "restaurant" && !cur.cuisine) store.updatePlace(cur.id, { cuisine: r.cuisine });
    if (r?.hours && !cur.hours) {
      found++;
      store.updatePlace(cur.id, { hours: r.hours, hoursSource: "osm", osm: r.osm });
    } else if (r?.osm && !cur.osm) store.updatePlace(cur.id, { osm: r.osm });
    if (BRANCHY.has(cur.category) && !cur.branchesCheckedAt) branches += (await attachBranches(cur.id)) || 0;
    await new Promise((res) => setTimeout(res, 400)); // 무료 API 예의상 천천히
  }
  e.target.disabled = false;
  e.target.textContent = "🔎 영업시간·메뉴·분점 찾기";
  toast(`영업시간 ${found}곳 · 분점 ${branches}곳을 찾았어요`, 3000);
});

// 지도에서 위치 고르기
function startPicking() {
  ui.picking = true;
  $("#sheet").close();
  setView("places");
  $("#pickBanner").hidden = false;
  $("#placesMap").scrollIntoView({ behavior: "smooth", block: "center" });
}
function stopPicking(reopen = true) {
  ui.picking = false;
  $("#pickBanner").hidden = true;
  if (reopen && ui.draft) openSheet(ui.draft.place, ui.draft.isNew, true);
}
$("#pickCancel").addEventListener("click", () => stopPicking());
placesMap.on("click", async (e) => {
  if (!ui.picking || !ui.draft) return;
  const d = ui.draft.place;
  d.lat = +e.latlng.lat.toFixed(6);
  d.lon = +e.latlng.lng.toFixed(6);
  if (!d.name) {
    const r = await reverseGeocode(d.lat, d.lon).catch(() => null);
    if (r?.name) d.name = r.name;
  }
  stopPicking();
});

// ---------------- 편집 시트 ----------------
function parkToast() {
  const el = $("#toast");
  if (el && el.parentElement !== document.body) document.body.appendChild(el);
}
$("#sheet").addEventListener("close", parkToast);

function openSheet(place, isNew = false, keepDraft = false) {
  parkToast(); // 시트 innerHTML을 바꾸면 그 안에 있던 토스트가 같이 지워지므로
  if (ui.picking && !keepDraft) stopPicking(false);
  if (!keepDraft) ui.draft = { place: structuredClone(place), orig: structuredClone(place), isNew };
  const p = ui.draft.place;
  const t = trip();
  const dayOpts = (sel, none) =>
    `<option value="">${none}</option>` + t.meta.days.map((_, d) => `<option value="${d}" ${sel === d ? "selected" : ""}>DAY ${d + 1} · ${dayLabel(d)}</option>`).join("");
  const others = livePlaces().filter((q) => q.id !== p.id);
  const slots = p.slots || [];

  $("#sheet").innerHTML = `<form method="dialog" id="sheetForm">
    <h2>${isNew ? "장소 추가" : "장소 편집"}</h2>
    <div class="field"><label for="f-name">이름</label><input type="text" id="f-name" value="${esc(p.name)}" required></div>
    <div class="field inline">
      <div><label class="label" for="f-cat">종류</label><select id="f-cat">${Object.entries(CATEGORIES)
        .map(([k, c]) => `<option value="${k}" ${p.category === k ? "selected" : ""}>${c.icon} ${esc(c.label)}</option>`)
        .join("")}</select></div>
      <div><label class="label" for="f-dur">머무는 시간(분)</label><input type="number" id="f-dur" min="10" max="600" step="5" value="${num(p.duration)}"></div>
    </div>
    <div class="field inline" id="f-meal-wrap" ${p.category === "restaurant" ? "" : "hidden"}>
      <div><label class="label" for="f-cuisine">메뉴</label><select id="f-cuisine">${Object.entries(CUISINES)
        .map(([k, c]) => `<option value="${k}" ${(p.cuisine || "other") === k ? "selected" : ""}>${c.icon} ${esc(c.label)}</option>`)
        .join("")}</select></div>
      <div><label class="label" for="f-meal">끼니</label>
      <select id="f-meal">
        <option value="" ${!p.mealPref ? "selected" : ""}>점심·저녁 상관없음</option>
        <option value="breakfast" ${p.mealPref === "breakfast" ? "selected" : ""}>아침으로만</option>
        <option value="lunch" ${p.mealPref === "lunch" ? "selected" : ""}>점심으로만</option>
        <option value="dinner" ${p.mealPref === "dinner" ? "selected" : ""}>저녁으로만</option>
      </select></div></div>
    <div class="field inline">
      <label class="toggle"><input type="checkbox" id="f-sel" ${p.selected ? "checked" : ""}> 갈 곳</label>
      <label class="toggle"><input type="checkbox" id="f-must" ${p.priority === "must" ? "checked" : ""}> 꼭 가기</label>
    </div>
    <div class="field"><label for="f-hours">영업시간 (OSM 형식)</label>
      <div class="inline"><input type="text" id="f-hours" value="${esc(p.hours || "")}" placeholder="예: Mo-Fr 11:00-22:00; Sa,Su 10:00-23:00"><button type="button" class="small-btn" id="f-lookup">OSM 찾기</button></div>
      <div class="hint" id="f-hours-hint"></div></div>
    <div class="field" id="f-branch-wrap" ${BRANCHY.has(p.category) || p.branches?.length ? "" : "hidden"}><div class="label">지점</div>
      <div id="f-branches"></div>
      <button type="button" class="small-btn" id="f-findbranch">🔎 같은 이름 분점 찾기</button>
      <div class="hint">지점이 여러 곳이면 일정 만들 때 앞뒤 동선에 가장 맞는 지점으로 자동 선택돼요.</div></div>
    <div class="field"><div class="label">위치</div>
      <div class="inline"><span class="hint">📍 ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}</span><button type="button" class="small-btn" id="f-pick">지도에서 바꾸기</button></div></div>
    <div class="field"><label for="f-note">메모</label><textarea id="f-note">${esc(p.note || "")}</textarea></div>
    <details class="adv" ${slots.length || p.pin?.day != null || p.pin?.time || p.before ? "open" : ""}>
      <summary>시간 조건 (공연·예약·고정)</summary>
      <div class="field"><div class="label">정해진 시작 시각 (공연·투어·예약)</div>
        <div id="f-slots">${slots.map((s, i) => slotRow(s, i)).join("")}</div>
        <button type="button" class="small-btn" id="f-addslot">＋ 시각 추가</button>
        <div class="hint">하나라도 넣으면 그중 한 시각에만 배정돼요. 비워두면 영업시간 안에서 자유롭게 배정해요.</div></div>
      <div class="field inline">
        <div><label class="label" for="f-pinday">날짜 고정</label><select id="f-pinday">${dayOpts(p.pin?.day ?? null, "자동")}</select></div>
        <div><label class="label" for="f-pintime">시작 시각 고정</label><input type="time" id="f-pintime" value="${esc(p.pin?.time || "")}"></div>
      </div>
      <div class="field"><label for="f-before">같은 날, 이 장소보다 먼저 가기</label>
        <select id="f-before"><option value="">없음</option>${others
          .map((q) => `<option value="${esc(q.id)}" ${p.before === q.id ? "selected" : ""}>${esc(q.name)}</option>`)
          .join("")}</select>
        <div class="hint">예: 러시 티켓 줄서기 → 같은 날 공연보다 먼저</div></div>
    </details>
    <div class="card-actions"><a href="${esc(gmapsUrl(p))}" target="_blank" rel="noopener">구글 지도에서 보기</a>${/^https?:\/\//i.test(p.website || "") ? `<a href="${esc(p.website)}" target="_blank" rel="noopener">웹사이트</a>` : ""}</div>
    <div class="sheet-actions">
      ${isNew ? "" : '<button type="button" class="danger" id="f-del">삭제</button>'}
      <button type="button" id="f-cancel">취소</button>
      <button type="submit" class="primary">${isNew ? "추가" : "저장"}</button>
    </div>
  </form>`;

  const renderBranches = () => {
    const bs = ui.draft.place.branches || [];
    $("#f-branches").innerHTML = bs.length
      ? `<div class="hint">본점: ${esc(ui.draft.place.addr || "현재 위치")}</div>` +
        bs
          .map(
            (b, i) => `<div class="slot-row"><span class="hint" style="flex:1">${esc(b.label)} · ${b.hours ? "영업시간 OSM" : "영업시간은 본점과 같게"}</span>
              <button type="button" class="small-btn" data-delbranch="${i}">✕</button></div>`,
          )
          .join("")
      : `<div class="hint">${ui.draft.place.branchesCheckedAt ? "찾아본 분점이 없어요." : "아직 분점을 찾아보지 않았어요."}</div>`;
  };
  renderBranches();
  $("#f-branches").addEventListener("click", (e) => {
    const b = e.target.closest("[data-delbranch]");
    if (!b) return;
    ui.draft.place.branches = ui.draft.place.branches.filter((_, i) => i !== +b.dataset.delbranch);
    renderBranches();
  });
  const draft = ui.draft;
  const stillOpen = () => ui.draft === draft && $("#sheet").open; // 결과가 늦게 와도 다른 장소 시트에 쓰지 않게
  $("#f-findbranch").addEventListener("click", async (e) => {
    readForm();
    e.target.disabled = true;
    e.target.textContent = "찾는 중…";
    const found = await findBranches(draft.place, trip().meta.hotel).catch(() => null);
    const branches = found ? await fillBranchHours(found) : null;
    if (!stillOpen()) return;
    e.target.disabled = false;
    e.target.textContent = "🔎 같은 이름 분점 찾기";
    if (!branches) return toast("분점 검색에 실패했어요");
    ui.draft.place.branches = branches;
    ui.draft.place.branchesCheckedAt = Date.now();
    renderBranches();
    toast(branches.length ? `분점 ${branches.length}곳을 찾았어요 (저장을 눌러야 반영돼요)` : "같은 이름의 분점이 없어요");
  });

  const hint = () => {
    const raw = $("#f-hours").value.trim();
    const el = $("#f-hours-hint");
    if (!raw) {
      const c = cat($("#f-cat").value);
      el.className = "hint";
      el.textContent = `비어 있으면 기본값 ${c.hours.map(([o, cl]) => `${fmtMin(o)}–${fmtMin(cl)}`).join(", ")}을 써요.`;
      return;
    }
    const w = parseHours(raw);
    el.className = w ? "hint" : "hint bad";
    el.textContent = w ? describeHours(w) : "이 형식은 해석할 수 없어요. 기본값을 쓰게 돼요. (예: Mo-Su 11:00-22:00)";
  };
  hint();
  $("#f-hours").addEventListener("input", hint);
  $("#f-cat").addEventListener("change", (e) => {
    $("#f-dur").value = cat(e.target.value).dur;
    $("#f-meal-wrap").hidden = e.target.value !== "restaurant";
    $("#f-branch-wrap").hidden = !BRANCHY.has(e.target.value) && !(ui.draft.place.branches || []).length;
    hint();
  });
  $("#f-cancel").addEventListener("click", () => $("#sheet").close());
  $("#f-pick").addEventListener("click", () => {
    readForm();
    startPicking();
  });
  $("#f-addslot").addEventListener("click", () => {
    const box = $("#f-slots");
    box.insertAdjacentHTML("beforeend", slotRow({ day: null, time: "19:00" }, box.children.length));
  });
  $("#f-slots").addEventListener("click", (e) => {
    if (e.target.closest("[data-delslot]")) e.target.closest(".slot-row").remove();
  });
  $("#f-lookup").addEventListener("click", async (e) => {
    readForm();
    e.target.disabled = true;
    e.target.textContent = "찾는 중…";
    const r = await lookupHours(draft.place).catch(() => null);
    if (!stillOpen()) return;
    e.target.disabled = false;
    e.target.textContent = "OSM 찾기";
    if (r?.osm) ui.draft.place.osm = r.osm;
    if (r?.cuisine && $("#f-cat").value === "restaurant") $("#f-cuisine").value = r.cuisine;
    if (r?.hours) {
      $("#f-hours").value = r.hours;
      ui.draft.place.hoursSource = "osm";
      ui.draft.osmHours = r.hours;
      hint();
      toast("OSM에서 영업시간을 찾았어요");
    } else toast(r?.osm ? "OSM에 이 장소의 영업시간이 없어요" : "OSM에서 이 장소를 찾지 못했어요");
  });
  $("#f-del")?.addEventListener("click", () => {
    if (!confirm(`‘${p.name}’을(를) 삭제할까요?`)) return;
    store.deletePlace(p.id);
    $("#sheet").close();
    toast("삭제했어요");
  });
  $("#sheetForm").addEventListener("submit", (e) => {
    e.preventDefault();
    readForm();
    const d = ui.draft.place;
    if (!d.name.trim()) return toast("이름을 입력해주세요");
    if (ui.draft.isNew) store.addPlace(d);
    else {
      const orig = ui.draft.orig || {};
      const patch = {};
      for (const k of Object.keys(d)) if (k !== "id" && JSON.stringify(d[k]) !== JSON.stringify(orig[k])) patch[k] = d[k];
      if (Object.keys(patch).length) store.updatePlace(d.id, patch);
    }
    $("#sheet").close();
    toast(ui.draft.isNew ? "추가했어요" : "저장했어요");
  });

  if (!$("#sheet").open) $("#sheet").showModal();
}

function slotRow(s, i) {
  const opts = `<option value="">아무 날</option>` + trip().meta.days.map((_, d) => `<option value="${d}" ${s.day === d ? "selected" : ""}>DAY ${d + 1} · ${dayLabel(d)}</option>`).join("");
  return `<div class="slot-row"><select data-slotday>${opts}</select><input type="time" data-slottime value="${esc(s.time)}"><button type="button" class="small-btn" data-delslot>✕</button></div>`;
}

function readForm() {
  const d = ui.draft.place;
  d.name = $("#f-name").value.trim();
  d.category = $("#f-cat").value;
  d.duration = Math.max(10, Math.min(600, Math.round(+$("#f-dur").value || cat(d.category).dur)));
  d.selected = $("#f-sel").checked;
  d.priority = $("#f-must").checked ? "must" : "want";
  d.mealPref = d.category === "restaurant" ? $("#f-meal").value || null : null;
  d.cuisine = d.category === "restaurant" ? $("#f-cuisine").value : null;
  const hours = $("#f-hours").value.trim() || null;
  if (hours !== d.hours) d.hoursSource = hours && hours === ui.draft.osmHours ? "osm" : hours ? "manual" : null;
  d.hours = hours;
  d.note = $("#f-note").value.trim();
  d.slots = [...document.querySelectorAll("#f-slots .slot-row")]
    .map((row) => ({ day: row.querySelector("[data-slotday]").value === "" ? null : +row.querySelector("[data-slotday]").value, time: row.querySelector("[data-slottime]").value }))
    .filter((s) => toMin(s.time) != null);
  const pd = $("#f-pinday").value;
  d.pin = { day: pd === "" ? null : +pd, time: $("#f-pintime").value || null };
  d.before = $("#f-before").value || null;
}

// ---------------- 설정 ----------------
// 설정 칸에 입력 중인 값이 있으면(토큰 복사하러 다른 앱에 다녀오는 동안 등) 자동 갱신으로 지우지 않는다
function renderSettings(force = false) {
  if (!force && ui.settingsDirty) return;
  ui.settingsDirty = false;
  const connected = !!store.token;
  $("#syncSection").innerHTML = `<div class="card">
    <h3>🔄 두 사람 공유 (GitHub)</h3>
    ${
      connected
        ? `<div class="status-line">${store.canWrite ? `✅ ${esc(store.user)} 계정으로 공유 중` : `⚠️ 연결됐지만 쓸 수 없어요 ${store.error ? `(${esc(store.error)})` : ""}`}</div>
           <p>저장소 <code>${esc(REPO.owner)}/${esc(REPO.repo)}</code>의 <code>trip-data</code> 브랜치에 자동 저장돼요.${store.lastSync ? ` 마지막 동기화 ${new Date(store.lastSync).toLocaleTimeString("ko-KR")}` : ""}</p>
           <div class="row-actions"><button id="syncNow">지금 동기화</button><button id="logout" class="danger">연결 해제</button></div>`
        : `<p>GitHub 토큰을 한 번 넣으면 이 폰에서 바꾼 내용이 상대방 폰에도 반영돼요. 토큰 없이도 공유된 일정을 볼 수는 있어요.</p>
           <div class="field" style="margin-top:10px"><input type="password" id="tokenInput" placeholder="ghp_… 또는 github_pat_…" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
           <div class="row-actions"><button id="saveToken" class="primary">연결</button></div>
           <ol>
             <li><b>collaborator</b>: <a href="https://github.com/settings/tokens/new?scopes=public_repo&description=nyc-trip" target="_blank" rel="noopener">이 링크</a>로 classic 토큰 만들기 (<code>public_repo</code>가 체크된 채로 열려요) → 맨 아래 <b>Generate token</b></li>
             <li><b>저장소 주인(${esc(REPO.owner)})</b>: <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">이 링크</a>로 fine-grained 토큰 → Repository access는 <code>${esc(REPO.repo)}</code>만 → Permissions의 <b>Contents</b>를 <b>Read and write</b></li>
             <li>나온 토큰을 위에 붙여넣고 연결. 토큰은 이 폰에만 저장돼요. (GitHub 앱에는 이 메뉴가 없어서 브라우저로 열어야 해요)</li>
           </ol>`
    }
  </div>`;

  const m = trip().meta;
  // 화면에 그린 값 — 저장할 때 바뀐 칸만 골라내는 기준
  ui.settingsBase = { days: structuredClone(m.days), hotel: { name: m.hotel.name, lat: String(num(m.hotel.lat)), lon: String(num(m.hotel.lon)) } };
  $("#tripSection").innerHTML = `<div class="card">
    <h3>🗓 여행 시간</h3>
    <p>하루에 호텔을 나설 수 있는 가장 이른 시각과 돌아와야 하는 시각이에요. 첫날 시작은 체크인, 마지막 날 끝은 체크아웃이에요.</p>
    <div style="margin-top:10px">${m.days
      .map(
        (d, i) => `<div class="day-row"><span>${dayLabel(i)}</span><input type="time" data-daystart="${i}" value="${esc(d.start)}"><input type="time" data-dayend="${i}" value="${esc(d.end)}"></div>`,
      )
      .join("")}</div>
    <div class="field"><label for="hotelName">호텔</label><input type="text" id="hotelName" value="${esc(m.hotel.name)}"></div>
    <div class="field inline"><input type="number" step="0.00001" id="hotelLat" value="${num(m.hotel.lat)}"><input type="number" step="0.00001" id="hotelLon" value="${num(m.hotel.lon)}"></div>
    <div class="row-actions"><button id="saveTrip" class="primary">저장</button></div>
  </div>`;
}

$("#view-settings").addEventListener("input", () => (ui.settingsDirty = true));
$("#view-settings").addEventListener("click", async (e) => {
  const id = e.target.id;
  if (id === "saveToken") {
    const v = $("#tokenInput").value.trim();
    if (!v) return;
    e.target.disabled = true;
    const r = await store.setToken(v);
    if (r.ok) {
      toast(`${store.user} 계정으로 연결됐어요`);
      await store.sync();
      renderSettings(true);
    } else {
      toast(r.error || "연결 실패", 3500);
      e.target.disabled = false; // 입력한 토큰은 그대로 두고 다시 시도할 수 있게
    }
  }
  if (id === "logout" && confirm("이 폰에서 GitHub 연결을 해제할까요?")) {
    await store.setToken(null);
    renderSettings(true);
  }
  if (id === "syncNow") store.sync({ force: true });
  if (id === "saveTrip") {
    // 이 화면에서 실제로 바꾼 칸만 반영한다 (그 사이 상대 폰이 바꾼 다른 칸은 그대로)
    const base = ui.settingsBase || { days: [], hotel: {} };
    const pick = (formVal, baseVal, curVal) => (formVal && formVal !== baseVal ? formVal : curVal);
    const days = trip().meta.days.map((d, i) => ({
      start: pick(document.querySelector(`[data-daystart="${i}"]`).value, base.days[i]?.start, d.start),
      end: pick(document.querySelector(`[data-dayend="${i}"]`).value, base.days[i]?.end, d.end),
    }));
    if (days.some((d) => toMin(d.end) <= toMin(d.start))) return toast("끝 시각이 시작보다 늦어야 해요");
    const h = trip().meta.hotel;
    const latIn = $("#hotelLat").value;
    const lonIn = $("#hotelLon").value;
    const lat = latIn !== String(base.hotel.lat) ? +latIn : h.lat;
    const lon = lonIn !== String(base.hotel.lon) ? +lonIn : h.lon;
    // 뉴욕 근처가 아니면 저장하지 않는다 (경도 부호 실수 등)
    if (!(lat > 40.45 && lat < 41.0 && lon > -74.35 && lon < -73.65)) return toast("호텔 좌표가 뉴욕이 아니에요. 예: 40.70983, -74.01402 (경도는 음수)", 4000);
    const nameIn = $("#hotelName").value.trim();
    const name = nameIn && nameIn !== base.hotel.name ? nameIn : h.name;
    store.updateMeta({ days, hotel: { name, lat, lon } });
    toast("저장했어요");
    renderSettings(true);
  }
  if (id === "snapshotBtn") {
    const url = await store.snapshotLink();
    try {
      await navigator.clipboard.writeText(url);
      toast("링크를 복사했어요. 카톡에 붙여넣어 보내세요");
    } catch {
      prompt("이 링크를 복사하세요", url);
    }
  }
  if (id === "resetBtn" && confirm("이 폰의 데이터를 지울까요? (공유된 데이터는 그대로예요)")) {
    await store.resetLocal();
    toast("초기화했어요");
  }
});

// ---------------- 공통 ----------------
document.querySelector(".mainnav").addEventListener("click", (e) => {
  const b = e.target.closest(".nav");
  if (b) setView(b.dataset.view);
});
$("#syncChip").addEventListener("click", () => setView("settings"));
$("#shareBtn").addEventListener("click", async () => {
  const url = `${location.origin}${location.pathname}`;
  try {
    if (navigator.share) await navigator.share({ title: "OUR NYC TRIP 🗽", text: "우리 뉴욕 여행 일정", url });
    else {
      await navigator.clipboard.writeText(url);
      toast("링크가 복사됐어요! 카톡에 붙여넣으면 됩니다 💕");
    }
  } catch {}
});

function render() {
  renderHeader();
  if (ui.view === "plan") renderPlan();
  if (ui.view === "places") renderPlaces();
  if (ui.view === "settings" && !document.activeElement?.closest("#view-settings")) renderSettings();
}

store.addEventListener("change", () => {
  render();
  if (ui.view === "plan") drawPlanMap();
  if (ui.view === "places") drawPlacesMap();
});
store.addEventListener("status", () => {
  renderHeader();
  if (ui.view === "settings" && !document.activeElement?.closest("#view-settings input")) renderSettings();
});

// 오프라인에서도 열리도록 (sw.js 참고)
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

async function init() {
  $("#requestHint").textContent = REQUEST_HINT;
  render();
  drawPlanMap();
  // 링크로 받은 데이터 합치기
  if (location.hash.startsWith("#s=")) {
    try {
      const snap = await Store.readSnapshot(location.hash);
      if (snap && confirm("공유받은 여행 데이터를 이 폰 데이터와 합칠까요?")) {
        store.update((t) => Object.assign(t, mergeTrips(t, snap)));
        toast("공유받은 데이터를 합쳤어요");
      }
    } catch {
      toast("공유 링크를 읽지 못했어요");
    }
    history.replaceState(null, "", location.pathname);
  }
  if (store.token) await store.checkAuth();
  await store.sync();
  render();
  drawPlanMap();

  // 토큰이 있으면 30초, 없으면(API 호출 한도 때문에) 3분마다 새로 불러온다
  let lastPoll = Date.now();
  const poll = (force) => {
    if (document.visibilityState !== "visible") return;
    if (!force && Date.now() - lastPoll < (store.token ? 30000 : 180000) - 1000) return;
    lastPoll = Date.now();
    store.sync();
  };
  setInterval(() => poll(false), 30000);
  document.addEventListener("visibilitychange", () => poll(true));
  // 여행 중에는 "지금" 표시를 위해 1분마다 다시 그린다
  setInterval(() => ui.view === "plan" && renderPlan(), 60000);
}
init();
