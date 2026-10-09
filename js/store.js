// 여행 데이터 저장·공유.
// - 각 폰: localStorage에 바로 저장 (오프라인에서도 동작)
// - 공유: GitHub 저장소의 별도 브랜치(trip-data)에 data/trip.json으로 저장.
//   사이트 코드(main)와 분리해 두어 저장할 때마다 GitHub Pages가 다시 빌드되지 않게 한다.
// - 합치기: 장소는 id별로 updatedAt이 최신인 쪽, 설정(meta)은 필드·설정 키·요청마다 최신인 쪽, 일정은 최신인 쪽을 쓴다.
import { seedTrip, migrateTrip } from "./seed.js";

const LS_TRIP = "nyc-trip:trip";
const LS_TOKEN = "nyc-trip:token";
const DATA_BRANCH = "trip-data";
const DATA_PATH = "data/trip.json";
const API = "https://api.github.com";

function repoFromLocation() {
  const host = location.hostname;
  if (host.endsWith(".github.io")) {
    const repo = location.pathname.split("/").filter(Boolean)[0];
    if (repo) return { owner: host.replace(".github.io", ""), repo };
  }
  return { owner: "MIN-JEONG-WYNTER", repo: "nyc-trip" };
}
export const REPO = repoFromLocation();

const lsGet = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const lsSet = (k, v) => {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {}
};

// 키 순서와 무관하게 비교하기 위한 직렬화
function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
      .join(",")}}`;
  return JSON.stringify(v);
}
export const sameTrip = (a, b) => canonical(a) === canonical(b);

// ---------- 설정(meta) 합치기 ----------
// 필드마다 마지막으로 바꾼 시각을 meta.fieldsUpdatedAt에 둔다: { days, hotel, title, "prefs.<키>", requests, ... }
// 요청은 하나씩 updatedAt을 갖고, 지운 요청은 { id, deleted: true, updatedAt } 묘비로 남겨 다른 폰에도 지워지게 한다.
const META_SKIP = new Set(["updatedAt", "fieldsUpdatedAt", "prefs", "requests"]);
const metaKeys = (m) => [...Object.keys(m || {}).filter((k) => !META_SKIP.has(k)), ...Object.keys(m?.prefs || {}).map((k) => `prefs.${k}`), "requests"];
// 필드별 시각이 없거나, 예전 앱이 meta를 통째로 써서 updatedAt이 더 새로우면 모든 필드를 updatedAt 시각으로 본다
const isLegacyMeta = (m) => !m?.fieldsUpdatedAt || (m.updatedAt || 0) > Math.max(0, ...Object.values(m.fieldsUpdatedAt).map((v) => +v || 0));
const fieldTime = (m, key) => (isLegacyMeta(m) ? m?.updatedAt || 0 : m.fieldsUpdatedAt[key] || 0);

// 바꾼 필드에 시각을 찍는다 (나머지 필드의 지금 시각도 함께 적어 둔다)
function stampMeta(m, keys, now) {
  // 시각 없는 예전 요청은 지금 시각을 받아 두어야 이후 목록 시각이 바뀌어도 그대로 남는다
  const rt = fieldTime(m, "requests");
  if (m.requests) m.requests = m.requests.map((r) => (r.updatedAt == null ? { ...r, updatedAt: rt } : r));
  const fu = {};
  for (const k of metaKeys(m)) fu[k] = fieldTime(m, k);
  for (const k of keys) fu[k] = now;
  m.fieldsUpdatedAt = fu;
  m.updatedAt = Math.max(now, m.updatedAt || 0, ...Object.values(fu));
}

// 지운 요청(묘비)을 뺀 요청 목록
export const activeRequests = (trip) => (trip?.meta?.requests || []).filter((r) => r && !r.deleted);

function mergeRequests(l, r) {
  const lt = fieldTime(l, "requests");
  const rt = fieldTime(r, "requests");
  const lm = new Map((l.requests || []).map((q) => [q.id, q]));
  const rm = new Map((r.requests || []).map((q) => [q.id, q]));
  const out = [];
  for (const id of [...rm.keys(), ...[...lm.keys()].filter((id) => !rm.has(id))]) {
    const a = lm.get(id);
    const b = rm.get(id);
    if (a && b) {
      const ta = a.updatedAt ?? lt;
      const tb = b.updatedAt ?? rt;
      const w = ta !== tb ? (ta > tb ? a : b) : a.deleted ? a : b.deleted ? b : canonical(a) >= canonical(b) ? a : b;
      out.push(w.updatedAt == null ? { ...w, updatedAt: Math.max(ta, tb) } : w);
      continue;
    }
    // 한쪽에만 있는 요청: 새 방식이면 상대가 아직 못 본 것 → 살린다.
    // 예전 앱은 지울 때 목록에서 빼기만 했으므로, 상대가 예전 방식으로 그 뒤에 목록을 썼으면 지운 것으로 보고 묘비를 남긴다.
    const [q, qt, other, ot] = a ? [a, a.updatedAt ?? lt, r, rt] : [b, b.updatedAt ?? rt, l, lt];
    out.push(!q.deleted && isLegacyMeta(other) && ot > qt ? { id, text: "", deleted: true, updatedAt: ot } : q.updatedAt == null ? { ...q, updatedAt: qt } : q);
  }
  return out;
}

function mergeMeta(l, r) {
  if (!r) return l;
  if (!l) return r;
  const out = {};
  const fu = {};
  const pick = (key, lv, rv) => {
    const lt = fieldTime(l, key);
    const rt = fieldTime(r, key);
    if (lv === undefined) return [rv, rt];
    if (rv === undefined) return [lv, lt];
    if (lt !== rt) return lt > rt ? [lv, lt] : [rv, rt];
    return [canonical(lv) >= canonical(rv) ? lv : rv, lt]; // 같은 시각이면 어느 폰에서든 같은 쪽을 고르도록
  };
  for (const k of new Set([...Object.keys(r), ...Object.keys(l)])) {
    if (META_SKIP.has(k)) continue;
    [out[k], fu[k]] = pick(k, l[k], r[k]);
  }
  if (l.prefs || r.prefs) {
    out.prefs = {};
    for (const k of new Set([...Object.keys(r.prefs || {}), ...Object.keys(l.prefs || {})]))
      [out.prefs[k], fu[`prefs.${k}`]] = pick(`prefs.${k}`, l.prefs?.[k], r.prefs?.[k]);
  }
  if (l.requests || r.requests) out.requests = mergeRequests(l, r);
  fu.requests = Math.max(fieldTime(l, "requests"), fieldTime(r, "requests"));
  out.fieldsUpdatedAt = fu;
  out.updatedAt = Math.max(l.updatedAt || 0, r.updatedAt || 0, ...Object.values(fu));
  return out;
}

// 장소 수정은 항목별 시각(fu)을 남긴다 — 두 폰이 같은 장소의 다른 항목을 고쳐도 둘 다 살아남게.
// baseAt: 항목별 시각을 처음 남길 때의 시각 (그 전에 바뀐 항목들의 기준)
export function stampPlace(p, patch, now, user) {
  if (!p.fu) {
    p.fu = {};
    p.baseAt = p.updatedAt || 0;
  }
  for (const k of Object.keys(patch)) p.fu[k] = now;
  Object.assign(p, patch, { updatedAt: now, updatedBy: user ?? p.updatedBy ?? null });
  return p;
}
const PLACE_META = new Set(["fu", "baseAt", "updatedAt", "updatedBy"]);
const fieldAt = (p, k) => p.fu?.[k] ?? p.baseAt ?? p.updatedAt ?? 0;

function mergePlace(a, b) {
  // a = local, b = remote. 같은 시각이면 remote
  if (!a.fu && !b.fu) return (a.updatedAt || 0) > (b.updatedAt || 0) ? a : b; // 둘 다 예전 형식
  const out = {};
  const fu = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (PLACE_META.has(k)) continue;
    const ta = k in a ? fieldAt(a, k) : -1;
    const tb = k in b ? fieldAt(b, k) : -1;
    const src = ta > tb ? a : b;
    if (k in src) out[k] = src[k];
    fu[k] = Math.max(ta, tb, 0);
  }
  out.fu = fu;
  out.baseAt = Math.min(a.baseAt ?? a.updatedAt ?? 0, b.baseAt ?? b.updatedAt ?? 0);
  out.updatedAt = Math.max(a.updatedAt || 0, b.updatedAt || 0);
  out.updatedBy = (a.updatedAt || 0) > (b.updatedAt || 0) ? a.updatedBy : b.updatedBy;
  return out;
}

export function mergeTrips(local, remote) {
  if (!remote) return local;
  if (!local) return remote;
  const byId = new Map();
  for (const p of remote.places || []) byId.set(p.id, p);
  for (const p of local.places || []) {
    const r = byId.get(p.id);
    byId.set(p.id, r ? mergePlace(p, r) : p);
  }
  const newer = (a, b, key) => ((a?.[key] || 0) > (b?.[key] || 0) ? a : b);
  return {
    schema: 1,
    meta: mergeMeta(local.meta, remote.meta),
    places: [...byId.values()],
    schedule: newer(local.schedule, remote.schedule, "generatedAt") || null,
  };
}

const b64encode = (str) => {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const b64decode = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), (c) => c.charCodeAt(0)));

const NET_MSG = "인터넷 연결이 안 돼요 · 연결되면 다시 시도해요";
const TOKEN_MSG = "토큰이 만료됐거나 잘못됐어요 — 설정에서 다시 연결";
const ANON_READ_GAP = 60000; // 토큰 없이 API로 읽는 건 1분에 한 번 (시간당 60회 한도)
const netError = () => Object.assign(new Error(NET_MSG), { network: true });
const newReqId = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export class Store extends EventTarget {
  constructor() {
    super();
    let trip = null;
    const raw = lsGet(LS_TRIP);
    try {
      const saved = JSON.parse(raw);
      if (saved?.schema === 1) trip = migrateTrip(saved);
    } catch {
      lsSet(`${LS_TRIP}:broken`, raw); // 읽지 못한 데이터는 따로 남겨 두고 처음 데이터로 시작
    }
    this.trip = trip || seedTrip();
    this.token = lsGet(LS_TOKEN);
    this.user = null; // GitHub 로그인
    this.canWrite = false;
    this.tokenInvalid = false; // 저장된 토큰이 401 → 토큰 없이 읽기만
    this.authError = null;
    this.status = "local"; // local | syncing | synced | error
    this.error = null;
    this.lastSync = null;
    this.lastAnonRead = 0;
    this.remoteSha = null;
    this.etag = null;
    this.remote = null;
    this.pushTimer = null;
    this.queue = Promise.resolve();
  }

  emit(type) {
    this.dispatchEvent(new Event(type));
  }

  setStatus(status, error = null) {
    this.status = status;
    this.error = error;
    this.emit("status");
  }

  saveLocal() {
    lsSet(LS_TRIP, JSON.stringify(this.trip));
  }

  // 데이터 변경: fn이 trip을 직접 수정한다
  update(fn) {
    const next = structuredClone(this.trip);
    fn(next);
    this.trip = next;
    this.saveLocal();
    this.emit("change");
    this.schedulePush();
  }

  updatePlace(id, patch) {
    this.update((t) => {
      const p = t.places.find((x) => x.id === id);
      if (p) stampPlace(p, patch, Date.now(), this.user);
    });
  }

  // 장소 삭제 (이 장소를 "먼저 갈 곳"으로 정한 다른 장소의 연결도 끊는다)
  deletePlace(id) {
    this.update((t) => {
      const now = Date.now();
      for (const p of t.places) {
        if (p.id === id) stampPlace(p, { deleted: true, selected: false }, now, this.user);
        else if (p.before === id) stampPlace(p, { before: null }, now, this.user);
      }
    });
  }

  addPlace(place) {
    this.update((t) => t.places.push({ ...place, addedBy: this.user, updatedAt: Date.now() }));
  }

  // ---------- 설정·요청 (필드별 시각을 찍어 두 폰의 변경이 섞여도 안 사라지게) ----------
  // days, hotel, title, startDate 등. prefs를 넘기면 키마다 setPref와 같다
  updateMeta(patch) {
    this.update((t) => {
      const now = Date.now();
      const keys = [];
      for (const [k, v] of Object.entries(patch)) {
        if (k === "prefs") {
          t.meta.prefs = { ...(t.meta.prefs || {}), ...structuredClone(v) };
          keys.push(...Object.keys(v).map((pk) => `prefs.${pk}`));
        } else if (!["requests", "updatedAt", "fieldsUpdatedAt"].includes(k)) {
          t.meta[k] = structuredClone(v);
          keys.push(k);
        }
      }
      stampMeta(t.meta, keys, now);
    });
  }

  setPref(key, value) {
    this.updateMeta({ prefs: { [key]: value } });
  }

  // 요청 추가 → 새 요청 id
  addRequest(text, extra = {}) {
    const id = extra.id || newReqId();
    this.update((t) => {
      const now = Date.now();
      t.meta.requests = [...(t.meta.requests || []).filter((r) => r.id !== id), { by: this.user, ...extra, id, text, updatedAt: now }];
      stampMeta(t.meta, ["requests"], now);
    });
    return id;
  }

  // 요청 삭제: 묘비로 바꿔 다른 폰에도 지워지게 한다
  removeRequest(id) {
    this.update((t) => {
      const list = t.meta.requests || [];
      const old = list.find((r) => r.id === id);
      const now = Math.max(Date.now(), (old?.updatedAt || 0) + 1);
      const tomb = { id, text: "", deleted: true, updatedAt: now }; // text: 아직 activeRequests를 안 쓰는 코드가 깨지지 않게
      t.meta.requests = old ? list.map((r) => (r.id === id ? tomb : r)) : [...list, tomb];
      stampMeta(t.meta, ["requests"], now);
    });
  }

  // ---------- GitHub ----------
  async gh(path, { method = "GET", body, etag, auth = this.tokenInvalid ? null : this.token } = {}) {
    const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    if (auth) headers.Authorization = `Bearer ${auth}`;
    if (etag) headers["If-None-Match"] = etag;
    if (body) headers["Content-Type"] = "application/json";
    try {
      return await fetch(`${API}${path}`, { method, headers, body: body && JSON.stringify(body), cache: "no-store" });
    } catch {
      throw netError();
    }
  }

  get authed() {
    return !!this.token && !this.tokenInvalid;
  }

  // 토큰을 확인만 한다 (상태는 바꾸지 않음)
  async _auth(token) {
    try {
      const u = await this.gh("/user", { auth: token });
      if (u.status === 401) return { ok: false, kind: "invalid", error: "토큰이 올바르지 않아요" };
      if (!u.ok) return { ok: false, kind: "retry", error: `GitHub 오류 ${u.status}` };
      const user = (await u.json()).login;
      const r = await this.gh(`/repos/${REPO.owner}/${REPO.repo}`, { auth: token });
      if (!r.ok) return { ok: false, kind: "denied", user, error: "저장소에 접근할 수 없어요" };
      const repo = await r.json();
      const canWrite = !!repo.permissions?.push;
      return { ok: canWrite, kind: canWrite ? null : "denied", user, canWrite, defaultBranch: repo.default_branch, error: canWrite ? undefined : "이 토큰으로는 저장소에 쓸 수 없어요 (권한 확인)" };
    } catch (e) {
      return { ok: false, kind: "retry", error: e.network ? NET_MSG : e.message };
    }
  }

  markTokenInvalid() {
    this.tokenInvalid = true;
    this.user = null;
    this.canWrite = false;
    this.etag = null;
  }

  // 토큰을 확인해서 저장한다. 실패하면 이전 상태 그대로 두고 { ok: false, error }
  async setToken(token) {
    if (!token) {
      Object.assign(this, { token: null, user: null, canWrite: false, tokenInvalid: false, authError: null, etag: null });
      lsSet(LS_TOKEN, null);
      this.emit("status");
      return { ok: true };
    }
    const res = await this._auth(token);
    if (!res.ok) return { ok: false, error: res.error };
    Object.assign(this, { token, user: res.user, canWrite: true, defaultBranch: res.defaultBranch, tokenInvalid: false, authError: null, etag: null });
    lsSet(LS_TOKEN, token);
    this.emit("status");
    return { ok: true };
  }

  async checkAuth() {
    if (!this.token) return { ok: false };
    const res = await this._auth(this.token);
    if (res.kind === "invalid") {
      this.markTokenInvalid();
      this.authError = TOKEN_MSG;
    } else if (res.kind === "retry") {
      // 오프라인 등: user를 비워 두어 다음 동기화 때 다시 확인한다
      this.user = null;
      this.canWrite = false;
      this.authError = res.error;
    } else {
      Object.assign(this, { user: res.user, canWrite: !!res.canWrite, defaultBranch: res.defaultBranch, tokenInvalid: false, authError: null });
    }
    this.emit("status");
    return res.ok ? { ok: true } : { ok: false, error: res.kind === "invalid" ? TOKEN_MSG : res.error };
  }

  // 원격 데이터를 읽는다. 바뀐 게 없으면 { unchanged: true }
  async fetchRemote() {
    const res = await this.gh(`/repos/${REPO.owner}/${REPO.repo}/contents/${DATA_PATH}?ref=${DATA_BRANCH}`, { etag: this.etag });
    if (res.status === 304) return { unchanged: true };
    if (res.status === 404) return { trip: null, sha: null };
    if (res.status === 401 && this.authed) {
      // 저장된 토큰이 만료됨: 토큰 없이 다시 읽는다
      this.markTokenInvalid();
      return this.fetchRemote();
    }
    if (res.status === 403 || res.status === 429) {
      // 토큰이 있으면 raw로 대신 읽지 않는다 (sha가 없어 저장이 계속 실패함) → 오류를 보여준다
      if (this.authed) {
        const limited = res.status === 429 || res.headers?.get("x-ratelimit-remaining") === "0";
        throw new Error(limited ? "GitHub 요청 한도를 넘었어요 · 잠시 후 다시 시도해요" : "저장소를 읽을 권한이 없어요 (403)");
      }
      // 토큰 없이 API 호출 한도를 넘긴 경우: raw 파일로 대신 읽는다 (최대 몇 분 지연)
      let raw;
      try {
        raw = await fetch(`https://raw.githubusercontent.com/${REPO.owner}/${REPO.repo}/${DATA_BRANCH}/${DATA_PATH}?t=${Date.now()}`);
      } catch {
        throw netError();
      }
      if (raw.status === 404) return { trip: null, sha: null };
      if (!raw.ok) throw new Error(`불러오기 실패 (${raw.status})`);
      return { trip: migrateTrip(await raw.json()), sha: this.remoteSha };
    }
    if (!res.ok) throw new Error(`불러오기 실패 (${res.status})`);
    const file = await res.json();
    const trip = migrateTrip(JSON.parse(b64decode(file.content)));
    this.etag = res.headers.get("ETag"); // 읽기에 성공한 뒤에만 (실패한 내용을 304로 다시 쓰지 않게)
    return { trip, sha: file.sha };
  }

  async ensureBranch() {
    const ref = await this.gh(`/repos/${REPO.owner}/${REPO.repo}/git/ref/heads/${DATA_BRANCH}`);
    if (ref.ok) return;
    const base = await this.gh(`/repos/${REPO.owner}/${REPO.repo}/git/ref/heads/${this.defaultBranch || "main"}`);
    if (!base.ok) throw new Error("기본 브랜치를 찾을 수 없어요");
    const sha = (await base.json()).object.sha;
    const created = await this.gh(`/repos/${REPO.owner}/${REPO.repo}/git/refs`, { method: "POST", body: { ref: `refs/heads/${DATA_BRANCH}`, sha } });
    if (!created.ok && created.status !== 422) throw new Error(`브랜치 생성 실패 (${created.status})`);
  }

  // 원격과 합친 결과를 반영한다
  applyMerged(merged) {
    if (!sameTrip(merged, this.trip)) {
      this.trip = merged;
      this.saveLocal();
      this.emit("change");
    }
  }

  // force: 사용자가 직접 누른 경우 등. 토큰 없이 읽을 때는 force가 아니면 1분에 한 번만 읽는다
  sync({ force = false } = {}) {
    this.queue = this.queue.then(() => this._sync(force)).catch(() => {});
    return this.queue;
  }

  async _sync(force) {
    if (!this.authed && !force && Date.now() - this.lastAnonRead < ANON_READ_GAP) return;
    this.setStatus("syncing");
    try {
      // 오프라인으로 시작했으면 연결된 지금 다시 확인한다
      if (this.authed && !this.user) await this.checkAuth();
      if (!this.authed) this.lastAnonRead = Date.now();
      const r = await this.fetchRemote();
      if (!r.unchanged) {
        this.remote = r.trip;
        this.remoteSha = r.sha;
      }
      const merged = mergeTrips(this.trip, this.remote);
      this.applyMerged(merged);
      if (this.canWrite && (!this.remote || !sameTrip(merged, this.remote))) await this._push();
      this.lastSync = Date.now();
      if (!this.token || this.canWrite) this.setStatus("synced");
      else if (this.tokenInvalid) this.setStatus("error", TOKEN_MSG);
      else this.setStatus("error", this.user ? "쓰기 권한 없음" : this.authError || NET_MSG);
    } catch (e) {
      this.setStatus("error", this.tokenInvalid ? TOKEN_MSG : e.message);
    }
  }

  async _push(attempt = 0) {
    const content = b64encode(JSON.stringify(this.trip, null, 1));
    const body = { message: `trip: update by ${this.user || "unknown"}`, content, branch: DATA_BRANCH };
    if (this.remoteSha) body.sha = this.remoteSha;
    if (!this.remote) await this.ensureBranch();
    const res = await this.gh(`/repos/${REPO.owner}/${REPO.repo}/contents/${DATA_PATH}`, { method: "PUT", body });
    if (res.ok) {
      const out = await res.json();
      this.remoteSha = out.content.sha;
      this.remote = structuredClone(this.trip);
      this.etag = null;
      return;
    }
    if (res.status === 401) {
      this.markTokenInvalid();
      throw new Error(TOKEN_MSG);
    }
    // 그 사이 다른 폰이 저장한 경우: 다시 읽어 합친 뒤 재시도
    if ((res.status === 409 || res.status === 422 || res.status === 404) && attempt < 3) {
      this.etag = null;
      const r = await this.fetchRemote();
      this.remote = r.trip;
      this.remoteSha = r.sha;
      this.applyMerged(mergeTrips(this.trip, this.remote));
      return this._push(attempt + 1);
    }
    throw new Error(`저장 실패 (${res.status})`);
  }

  schedulePush() {
    if (!this.canWrite) return;
    clearTimeout(this.pushTimer);
    this.setStatus("syncing");
    this.pushTimer = setTimeout(() => this.sync(), 1200);
  }

  resetLocal() {
    lsSet(LS_TRIP, null);
    this.trip = seedTrip();
    this.remote = null;
    this.etag = null;
    this.emit("change");
    return this.sync({ force: true });
  }

  // ---------- 링크로 공유 (스냅샷) ----------
  async snapshotLink() {
    const json = JSON.stringify(this.trip);
    let payload = `j${b64encode(json)}`;
    if (typeof CompressionStream !== "undefined") {
      const stream = new Blob([json]).stream().pipeThrough(new CompressionStream("deflate-raw"));
      const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      payload = `z${btoa(bin)}`;
    }
    payload = payload.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return `${location.origin}${location.pathname}#s=${payload}`;
  }

  static async readSnapshot(hash) {
    const m = /#s=([\w-]+)/.exec(hash);
    if (!m) return null;
    if (m[1].length > 200000) throw new Error("공유 링크가 너무 커요");
    const kind = m[1][0];
    const b64 = m[1].slice(1).replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    if (kind === "z") {
      // 압축을 풀면서 2MB를 넘으면 멈춘다 (작은 링크가 거대하게 풀려 폰이 멈추는 것 방지)
      const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
      const chunks = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 2e6) {
          reader.cancel();
          throw new Error("공유 링크가 너무 커요");
        }
        chunks.push(value);
      }
      return migrateTrip(JSON.parse(new TextDecoder().decode(await new Blob(chunks).arrayBuffer())));
    }
    return migrateTrip(JSON.parse(new TextDecoder().decode(bytes)));
  }
}
