// 여행 데이터 저장·공유.
// - 각 폰: localStorage에 바로 저장 (오프라인에서도 동작)
// - 공유: GitHub 저장소의 별도 브랜치(trip-data)에 data/trip.json으로 저장.
//   사이트 코드(main)와 분리해 두어 저장할 때마다 GitHub Pages가 다시 빌드되지 않게 한다.
// - 합치기: 장소는 id별로 updatedAt이 최신인 쪽, 설정·일정은 각각 최신인 쪽을 쓴다.
import { seedTrip } from "./seed.js";

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

export function mergeTrips(local, remote) {
  if (!remote) return local;
  if (!local) return remote;
  const byId = new Map();
  for (const p of remote.places) byId.set(p.id, p);
  for (const p of local.places) {
    const r = byId.get(p.id);
    if (!r || (p.updatedAt || 0) > (r.updatedAt || 0)) byId.set(p.id, p);
  }
  const order = [...remote.places.map((p) => p.id), ...local.places.map((p) => p.id).filter((id) => !remote.places.some((p) => p.id === id))];
  const newer = (a, b, key) => ((a?.[key] || 0) > (b?.[key] || 0) ? a : b);
  return {
    schema: 1,
    meta: newer(local.meta, remote.meta, "updatedAt"),
    places: order.map((id) => byId.get(id)),
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

export class Store extends EventTarget {
  constructor() {
    super();
    let saved = null;
    try {
      saved = JSON.parse(lsGet(LS_TRIP));
    } catch {}
    this.trip = saved?.schema === 1 ? saved : seedTrip();
    this.token = lsGet(LS_TOKEN);
    this.user = null; // GitHub 로그인
    this.canWrite = false;
    this.status = "local"; // local | syncing | synced | error
    this.error = null;
    this.lastSync = null;
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
      if (p) Object.assign(p, patch, { updatedAt: Date.now(), updatedBy: this.user });
    });
  }

  addPlace(place) {
    this.update((t) => t.places.push({ ...place, addedBy: this.user, updatedAt: Date.now() }));
  }

  // ---------- GitHub ----------
  async gh(path, { method = "GET", body, etag } = {}) {
    const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (etag) headers["If-None-Match"] = etag;
    if (body) headers["Content-Type"] = "application/json";
    return fetch(`${API}${path}`, { method, headers, body: body && JSON.stringify(body), cache: "no-store" });
  }

  async setToken(token) {
    this.token = token || null;
    lsSet(LS_TOKEN, this.token);
    this.user = null;
    this.canWrite = false;
    this.etag = null;
    if (!this.token) {
      this.emit("status");
      return { ok: true };
    }
    return this.checkAuth();
  }

  async checkAuth() {
    if (!this.token) return { ok: false };
    try {
      const u = await this.gh("/user");
      if (!u.ok) throw new Error(u.status === 401 ? "토큰이 올바르지 않아요" : `GitHub 오류 ${u.status}`);
      this.user = (await u.json()).login;
      const r = await this.gh(`/repos/${REPO.owner}/${REPO.repo}`);
      if (!r.ok) throw new Error("저장소에 접근할 수 없어요");
      const repo = await r.json();
      this.canWrite = !!repo.permissions?.push;
      this.defaultBranch = repo.default_branch;
      this.emit("status");
      return this.canWrite ? { ok: true } : { ok: false, error: "이 토큰으로는 저장소에 쓸 수 없어요 (권한 확인)" };
    } catch (e) {
      this.emit("status");
      return { ok: false, error: e.message };
    }
  }

  // 원격 데이터를 읽는다. 바뀐 게 없으면 { unchanged: true }
  async fetchRemote() {
    const res = await this.gh(`/repos/${REPO.owner}/${REPO.repo}/contents/${DATA_PATH}?ref=${DATA_BRANCH}`, { etag: this.etag });
    if (res.status === 304) return { unchanged: true };
    if (res.status === 404) return { trip: null, sha: null };
    if (res.status === 403 || res.status === 429) {
      // 토큰 없이 API 호출 한도를 넘긴 경우: raw 파일로 대신 읽는다 (최대 몇 분 지연)
      const raw = await fetch(`https://raw.githubusercontent.com/${REPO.owner}/${REPO.repo}/${DATA_BRANCH}/${DATA_PATH}?t=${Date.now()}`);
      if (raw.status === 404) return { trip: null, sha: null };
      if (!raw.ok) throw new Error(`불러오기 실패 (${raw.status})`);
      return { trip: await raw.json(), sha: this.remoteSha };
    }
    if (!res.ok) throw new Error(`불러오기 실패 (${res.status})`);
    this.etag = res.headers.get("ETag");
    const file = await res.json();
    return { trip: JSON.parse(b64decode(file.content)), sha: file.sha };
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

  sync() {
    this.queue = this.queue.then(() => this._sync()).catch(() => {});
    return this.queue;
  }

  async _sync() {
    this.setStatus("syncing");
    try {
      const r = await this.fetchRemote();
      if (!r.unchanged) {
        this.remote = r.trip;
        this.remoteSha = r.sha;
      }
      const merged = mergeTrips(this.trip, this.remote);
      this.applyMerged(merged);
      if (this.canWrite && (!this.remote || !sameTrip(merged, this.remote))) await this._push();
      this.lastSync = Date.now();
      this.setStatus(this.canWrite || !this.token ? "synced" : "error", this.token && !this.canWrite ? "쓰기 권한 없음" : null);
    } catch (e) {
      this.setStatus("error", e.message);
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
    return this.sync();
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
    const kind = m[1][0];
    const b64 = m[1].slice(1).replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    if (kind === "z") {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return JSON.parse(await new Response(stream).text());
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  }
}
