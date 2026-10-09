import { Store, REPO, mergeTrips } from "./store.js";
import { CATEGORIES, CUISINES, MEAL_SLOTS, cat, kindOf } from "./categories.js";
import { parseHours, describeHours, fmtMin, toMin, weekdayOf } from "./hours.js";
import { generateSchedule, inputsKey, tripDate } from "./optimizer.js";
import { searchPlaces, reverseGeocode, lookupHours } from "./search.js";

const store = new Store();
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const WEEK_EN = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const MEAL_PREF = { breakfast: "아침만", lunch: "점심만", dinner: "저녁만" };
const MODE = { walk: "🚶 도보", subway: "🚇 지하철", none: "📍 바로 옆" };

const ui = { view: "plan", day: null, filter: "all", draft: null, picking: false };

const trip = () => store.trip;
const livePlaces = () => trip().places.filter((p) => !p.deleted);
const placeById = (id) => trip().places.find((p) => p.id === id);
const newId = () => `p-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function toast(msg, ms = 2200) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), ms);
}

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
  if (week) return { label: p.hoursSource === "osm" ? "영업시간 OSM" : "영업시간 직접 입력", text: describeHours(week), ok: true };
  if (p.hours) return { label: "영업시간 해석 불가 → 기본값", text: p.hours, ok: false };
  const def = cat(p.category).hours.map(([o, c]) => `${fmtMin(o)}–${fmtMin(c)}`).join(", ");
  return { label: "영업시간 정보 없음 → 기본값", text: `기본값 ${def}`, ok: false };
}

const gmapsUrl = (p) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name} ${p.lat},${p.lon}`)}`;

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

  const st = sch.stats || {};
  const by = sch.by ? ` · ${esc(sch.by)}` : "";
  const when = new Date(sch.generatedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  $("#planStats").innerHTML = `총 이동 약 ${Math.floor(st.travel / 60)}시간 ${st.travel % 60}분<br>${when} 생성${by}`;

  const d = ui.day;
  const day = sch.days[d] || { items: [], back: { travel: 0 } };
  const win = t.meta.days[d];
  const names = day.items.map((it) => placeById(it.id)?.name).filter(Boolean);
  const missing = (day.missingMeals || []).map((m) => MEAL_SLOTS[m].label);
  $("#dayHead").innerHTML = `<h2>DAY ${d + 1} · ${esc(dayLabel(d))}</h2><p>${names.length ? esc(names.slice(0, 3).join(" → ")) + (names.length > 3 ? " …" : "") : "아직 배정된 곳이 없어요"}</p>
    ${missing.length ? `<span class="pill warn">⚠️ ${missing.join("·")} 먹을 시간이 없어요</span>` : ""}`;

  const rows = [];
  const firstLeave = day.items.length ? day.items[0].start - day.items[0].travel : toMin(win.start);
  rows.push(anchorRow(d === 0 ? fmtMin(toMin(win.start)) : fmtMin(firstLeave), d === 0 ? "🏨 체크인" : "🏨 호텔 출발", trip().meta.hotel.name));

  let num = 0;
  day.items.forEach((it) => {
    const legText = it.travel ? `${MODE[it.mode] || ""} 약 ${it.travel}분` : "";
    const waitText = it.wait >= 15 ? ` · ⏳ 여유 ${it.wait}분` : "";
    const isNow = now.dayIdx === d && now.min >= it.start && now.min < it.end;
    if (it.freeMeal) {
      rows.push(`
      <div class="item free ${isNow ? "now" : ""}">
        ${waitText ? `<div></div><div class="leg">${waitText.slice(3)}</div>` : ""}
        <div class="time"><div class="dot"></div>${fmtMin(it.start)}<small>~${fmtMin(it.end)}</small></div>
        <div class="card">
          <div class="type">🍽 ${MEAL_SLOTS[it.freeMeal].label} · 자유 식사${isNow ? " · 지금" : ""}</div>
          <h3>${MEAL_SLOTS[it.freeMeal].label} — 근처에서 자유롭게</h3>
          <p>정해둔 식당이 없는 끼니예요. ‘장소’에서 식당을 추가하면 이 자리에 들어가요.</p>
        </div>
      </div>`);
      return;
    }
    const p = placeById(it.id);
    if (!p) return;
    const i = num++;
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
          ${p.note ? `<p>${esc(p.note)}</p>` : ""}
          ${p.priority === "must" ? '<span class="pill must">꼭 가기</span>' : ""}
          ${pinned ? '<span class="pill pin">📌 고정</span>' : ""}
          ${hi.ok ? "" : '<span class="pill warn">영업시간 미확인</span>'}
          <div class="card-actions">
            <button data-act="pin" data-id="${esc(p.id)}" data-start="${it.start}">${pinned ? "고정 해제" : "📌 이 시간 고정"}</button>
            <button data-act="edit" data-id="${esc(p.id)}">편집</button>
            <a href="${esc(gmapsUrl(p))}" target="_blank" rel="noopener">구글 지도</a>
          </div>
        </div>
      </div>`);
  });

  const lastEnd = day.items.length ? day.items[day.items.length - 1].end + day.back.travel : null;
  const isLast = d === t.meta.days.length - 1;
  const backLeg = day.items.length && day.back.travel ? `${MODE[day.back.mode] || ""} 약 ${day.back.travel}분` : "";
  rows.push(
    anchorRow(
      isLast ? win.end : lastEnd != null ? fmtMin(lastEnd) : "",
      isLast ? "🧳 체크아웃" : "🏨 호텔 복귀",
      isLast && lastEnd != null ? `호텔 도착 ${fmtMin(lastEnd)}` : "",
      backLeg,
    ),
  );
  $("#timeline").innerHTML = rows.join("");

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
  let num = 0;
  day.items.forEach((it) => {
    const p = placeById(it.id);
    if (!p) return;
    const i = num++;
    pts.push([p.lat, p.lon]);
    L.marker([p.lat, p.lon], { icon: numIcon(i + 1) })
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

$("#generateBtn").addEventListener("click", () => {
  const selected = livePlaces().filter((p) => p.selected);
  if (!selected.length) {
    toast("‘장소’ 탭에서 갈 곳을 먼저 골라주세요");
    return;
  }
  const btn = $("#generateBtn");
  btn.disabled = true;
  btn.textContent = "⏳ 계산 중…";
  setTimeout(() => {
    const sch = generateSchedule(trip(), { timeBudgetMs: 900 });
    store.update((t) => (t.schedule = { ...sch, by: store.user }));
    btn.disabled = false;
    toast(sch.unscheduled.length ? `일정을 만들었어요 · ${sch.unscheduled.length}곳은 못 넣었어요` : "일정을 만들었어요 ✨");
    drawPlanMap();
  }, 30);
});

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
  const list = livePlaces().filter((p) => (ui.filter === "selected" ? p.selected : ui.filter === "unselected" ? !p.selected : true));
  document.querySelectorAll("#placeFilter .chip").forEach((c) => c.classList.toggle("active", c.dataset.filter === ui.filter));
  if (!list.length) {
    $("#placeList").innerHTML = `<div class="empty">장소가 없어요. 위에서 검색해 추가해보세요.</div>`;
    return;
  }
  const groupKey = (p) => (p.category === "restaurant" ? `food:${CUISINES[p.cuisine] ? p.cuisine : "other"}` : p.category);
  const groupInfo = (k) => (k.startsWith("food:") ? CUISINES[k.slice(5)] : CATEGORIES[k]);
  const groups = {};
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
            const extra = [p.priority === "must" ? "꼭 가기" : "", p.category === "restaurant" && MEAL_PREF[p.mealPref] ? MEAL_PREF[p.mealPref] : "", pinned ? "📌 고정" : "", (p.slots || []).length ? `🎫 ${p.slots.length}개 시각` : ""].filter(Boolean).join(" · ");
            return `<div class="place ${p.selected ? "" : "off"}">
              <button class="check ${p.selected ? "on" : ""}" data-toggle="${esc(p.id)}" aria-label="갈 곳으로 선택">${p.selected ? "✓" : ""}</button>
              <div class="info" data-open="${esc(p.id)}"><b>${esc(p.name)}</b><span>${p.duration}분 · ${esc(hi.label)}${extra ? ` · ${esc(extra)}` : ""}</span></div>
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
  store.addPlace(blankPlace({ id, name: r.name, lat: r.lat, lon: r.lon, category: r.category, osm: r.osm, note: r.addr }));
  renderResults();
  toast(`‘${r.name}’ 추가 · 영업시간 찾는 중…`);
  const found = await lookupHours(placeById(id)).catch(() => null);
  if (found?.cuisine && r.category === "restaurant") store.updatePlace(id, { cuisine: found.cuisine });
  if (found?.hours) {
    store.updatePlace(id, { hours: found.hours, hoursSource: "osm", osm: found.osm, website: found.website || null });
    toast(`‘${r.name}’ 영업시간을 OSM에서 가져왔어요`);
  } else {
    toast(`‘${r.name}’ 영업시간 정보가 없어 기본값을 써요 (편집에서 입력 가능)`, 3200);
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
  const targets = livePlaces().filter((p) => !p.hours || (p.category === "restaurant" && !p.cuisine));
  if (!targets.length) return toast("모든 장소에 영업시간(식당은 메뉴까지)이 있어요");
  e.target.disabled = true;
  let found = 0;
  for (const [i, p] of targets.entries()) {
    e.target.textContent = `🕐 찾는 중… ${i + 1}/${targets.length}`;
    const r = await lookupHours(p).catch(() => null);
    if (r?.cuisine && p.category === "restaurant" && !p.cuisine) store.updatePlace(p.id, { cuisine: r.cuisine });
    if (r?.hours && !p.hours) {
      found++;
      store.updatePlace(p.id, { hours: r.hours, hoursSource: "osm", osm: r.osm });
    } else if (r?.osm && !p.osm) store.updatePlace(p.id, { osm: r.osm });
    await new Promise((res) => setTimeout(res, 400)); // 무료 API 예의상 천천히
  }
  e.target.disabled = false;
  e.target.textContent = "🕐 빈 영업시간 OSM에서 찾기";
  toast(`${targets.length}곳 중 ${found}곳의 영업시간을 찾았어요`, 3000);
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
function openSheet(place, isNew = false, keepDraft = false) {
  if (!keepDraft) ui.draft = { place: structuredClone(place), isNew };
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
      <div><label class="label" for="f-dur">머무는 시간(분)</label><input type="number" id="f-dur" min="10" max="600" step="5" value="${p.duration}"></div>
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
    <div class="card-actions"><a href="${esc(gmapsUrl(p))}" target="_blank" rel="noopener">구글 지도에서 보기</a>${p.website ? `<a href="${esc(p.website)}" target="_blank" rel="noopener">웹사이트</a>` : ""}</div>
    <div class="sheet-actions">
      ${isNew ? "" : '<button type="button" class="danger" id="f-del">삭제</button>'}
      <button type="button" id="f-cancel">취소</button>
      <button type="submit" class="primary">${isNew ? "추가" : "저장"}</button>
    </div>
  </form>`;

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
    const r = await lookupHours(ui.draft.place).catch(() => null);
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
    store.update((t) => {
      const q = t.places.find((x) => x.id === p.id);
      Object.assign(q, { deleted: true, selected: false, updatedAt: Date.now() });
      t.places.forEach((x) => {
        if (x.before === p.id) Object.assign(x, { before: null, updatedAt: Date.now() });
      });
    });
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
      const { id, ...patch } = d;
      store.updatePlace(id, patch);
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
function renderSettings() {
  const connected = !!store.token;
  $("#syncSection").innerHTML = `<div class="card">
    <h3>🔄 두 사람 공유 (GitHub)</h3>
    ${
      connected
        ? `<div class="status-line">${store.canWrite ? `✅ ${esc(store.user)} 계정으로 공유 중` : `⚠️ 연결됐지만 쓸 수 없어요 ${store.error ? `(${esc(store.error)})` : ""}`}</div>
           <p>저장소 <code>${esc(REPO.owner)}/${esc(REPO.repo)}</code>의 <code>trip-data</code> 브랜치에 자동 저장돼요.${store.lastSync ? ` 마지막 동기화 ${new Date(store.lastSync).toLocaleTimeString("ko-KR")}` : ""}</p>
           <div class="row-actions"><button id="syncNow">지금 동기화</button><button id="logout" class="danger">연결 해제</button></div>`
        : `<p>GitHub 토큰을 한 번 넣으면 이 폰에서 바꾼 내용이 상대방 폰에도 반영돼요. 토큰 없이도 공유된 일정을 볼 수는 있어요.</p>
           <div class="field" style="margin-top:10px"><input type="text" id="tokenInput" placeholder="ghp_… 또는 github_pat_…" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
           <div class="row-actions"><button id="saveToken" class="primary">연결</button></div>
           <ol>
             <li>GitHub → Settings → Developer settings → Personal access tokens</li>
             <li><b>저장소 주인(${esc(REPO.owner)})</b>: Fine-grained token → Repository access는 <code>${esc(REPO.repo)}</code>만 → Permissions의 <b>Contents</b>를 <b>Read and write</b></li>
             <li><b>collaborator</b>: 남의 개인 저장소에는 fine-grained 토큰을 쓸 수 없어서 Tokens (classic) → <code>public_repo</code> 권한만 체크</li>
             <li>만든 토큰을 위에 붙여넣기. 토큰은 이 폰에만 저장돼요.</li>
           </ol>`
    }
  </div>`;

  const m = trip().meta;
  $("#tripSection").innerHTML = `<div class="card">
    <h3>🗓 여행 시간</h3>
    <p>하루에 호텔을 나설 수 있는 가장 이른 시각과 돌아와야 하는 시각이에요. 첫날 시작은 체크인, 마지막 날 끝은 체크아웃이에요.</p>
    <div style="margin-top:10px">${m.days
      .map(
        (d, i) => `<div class="day-row"><span>${dayLabel(i)}</span><input type="time" data-daystart="${i}" value="${esc(d.start)}"><input type="time" data-dayend="${i}" value="${esc(d.end)}"></div>`,
      )
      .join("")}</div>
    <div class="field"><label for="hotelName">호텔</label><input type="text" id="hotelName" value="${esc(m.hotel.name)}"></div>
    <div class="field inline"><input type="number" step="0.00001" id="hotelLat" value="${m.hotel.lat}"><input type="number" step="0.00001" id="hotelLon" value="${m.hotel.lon}"></div>
    <div class="row-actions"><button id="saveTrip" class="primary">저장</button></div>
  </div>`;
}

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
    } else toast(r.error || "연결 실패", 3500);
    renderSettings();
  }
  if (id === "logout" && confirm("이 폰에서 GitHub 연결을 해제할까요?")) {
    await store.setToken(null);
    renderSettings();
  }
  if (id === "syncNow") store.sync();
  if (id === "saveTrip") {
    const days = trip().meta.days.map((d, i) => ({
      start: document.querySelector(`[data-daystart="${i}"]`).value || d.start,
      end: document.querySelector(`[data-dayend="${i}"]`).value || d.end,
    }));
    if (days.some((d) => toMin(d.end) <= toMin(d.start))) return toast("끝 시각이 시작보다 늦어야 해요");
    const lat = +$("#hotelLat").value;
    const lon = +$("#hotelLon").value;
    store.update((t) => {
      t.meta = { ...t.meta, days, hotel: { name: $("#hotelName").value.trim() || t.meta.hotel.name, lat: lat || t.meta.hotel.lat, lon: lon || t.meta.hotel.lon }, updatedAt: Date.now() };
    });
    toast("저장했어요");
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

async function init() {
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
