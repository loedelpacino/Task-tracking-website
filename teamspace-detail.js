// teamspace-detail.js (updated: invite + new controls)
import { auth, db } from "./firebase-config.js";
import {
  ref, get, onValue, push, set, update, remove, child
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const params = new URLSearchParams(location.search);
const TEAMSPACE_ID = params.get("id");
if (!TEAMSPACE_ID) { alert("Geçersiz bağlantı."); location.href = "teamspaces.html"; }

// --- helpers ---
const $ = (s, r = document) => r.querySelector(s);
const emailKey = (s) => (s || "").toLowerCase().trim().replace(/[.#$\[\]]/g, "_");

// header elements
const nameEl = $("#ts-name");
const descEl = $("#ts-description");
const profileBtn = $("#profileBtn");

// board controls (yeni ID'ler)
const addBtn = $("#addBtn");
const titleInput = $("#taskTitle");
const descInput = $("#taskDesc");
const statusSelect = $("#taskStatus");

// lists
const listTodo = $("#list-todo");
const listProg = $("#list-in_progress");
const listDone = $("#list-done");

// invite UI
const inviteWrap = $("#inviteWrap");
const inviteEmailInput = $("#inviteEmail");
const inviteBtn = $("#inviteBtn");

// (opsiyonel) eski butonlar varsa çalışsın, yoksa sorun çıkarma
const editTsBtn = $("#editTsBtn");
const deleteTsBtn = $("#deleteTsBtn");

let USER = null;

// ---------- auth ----------
onAuthStateChanged(auth, async (user) => {
  if (!user) { location.href = "login.html"; return; }
  USER = user;
  profileBtn?.addEventListener("click", () => location.href = "profile.html");
  await loadTeamspaceHead();
  bindTasksRealtime();
});

// ---------- head + owner controls ----------
async function loadTeamspaceHead() {
  try {
    const snap = await get(child(ref(db), `teamspaces/${TEAMSPACE_ID}`));
    if (!snap.exists()) { nameEl.textContent = "Teamspace bulunamadı."; return; }
    const data = snap.val();

    nameEl.textContent = data.name;
    descEl.textContent = data.description || "Açıklama bulunmuyor.";

    // son kullanılan için cache
    localStorage.setItem("lastTeamspaceId", TEAMSPACE_ID);
    localStorage.setItem("lastTeamspaceName", data.name);

    const isOwner = USER && USER.uid === data.createdBy;

    // davet kutusu sadece owner'a görünür
    inviteWrap?.classList.toggle("hidden", !isOwner);
    inviteBtn?.addEventListener("click", () => sendInvite(inviteEmailInput.value));

    // varsa düzenle/sil butonlarını bağla (opsiyonel)
    if (editTsBtn) {
      editTsBtn.classList.toggle("hidden", !isOwner);
      editTsBtn.onclick = async () => {
        const newName = prompt("Yeni teamspace adı:", data.name || "");
        if (newName === null) return;
        const newDesc = prompt("Yeni açıklama:", data.description || "");
        await update(ref(db, `teamspaces/${TEAMSPACE_ID}`), {
          name: (newName || "").trim() || data.name,
          description: (newDesc || "").trim(),
        });
        await loadTeamspaceHead();
      };
    }
    if (deleteTsBtn) {
      deleteTsBtn.classList.toggle("hidden", !isOwner);
      deleteTsBtn.onclick = async () => {
        if (!confirm("Bu teamspace silinsin mi?")) return;
        await remove(ref(db, `teamspaces/${TEAMSPACE_ID}`));
        // ilişkili görevleri de kaldırmak istersen:
        // await remove(ref(db, `tasks/${TEAMSPACE_ID}`));
        location.href = "teamspaces.html";
      };
    }
  } catch (err) {
    console.error("Detay getirme hatası:", err);
    nameEl.textContent = "Bir hata oluştu.";
  }
}

// ---------- invite ----------
async function sendInvite(email) {
  const em = (email || "").toLowerCase().trim();
  if (!em) return alert("E-posta gerekli.");
  try {
    inviteBtn.disabled = true;
    // davet kaydı
    const iref = push(ref(db, "invites"));
    await set(iref, {
      teamspaceId: TEAMSPACE_ID,
      invitedEmail: em,
      inviterUid: USER.uid,
      status: "pending",
      createdAt: Date.now(),
    });
    // email -> davet index
    await set(ref(db, `user_invites_by_email/${emailKey(em)}/${iref.key}`), true);
    alert("Davet gönderildi.");
    inviteEmailInput.value = "";
  } catch (e) {
    console.error(e);
    alert("Davet gönderilemedi.");
  } finally {
    inviteBtn.disabled = false;
  }
}

// ---------- task create ----------
addBtn?.addEventListener("click", async () => {
  const title = (titleInput?.value || "").trim();
  const desc = (descInput?.value || "").trim();
  const status = (statusSelect?.value || "todo");
  if (!title) return alert("Başlık gerekli.");

  try {
    addBtn.disabled = true;
    const taskRef = push(ref(db, `tasks/${TEAMSPACE_ID}`));
    await set(taskRef, {
      title,
      description: desc,
      status,
      createdBy: USER.uid,
      teamspaceId: TEAMSPACE_ID,
      createdAt: Date.now(),
    });
    if (titleInput) titleInput.value = "";
    if (descInput) descInput.value = "";
    if (statusSelect) statusSelect.value = "todo";
  } catch (err) {
    console.error(err);
    alert("Görev eklenemedi.");
  } finally {
    addBtn.disabled = false;
  }
});

// ---------- tasks realtime + render ----------
function bindTasksRealtime() {
  const tRef = ref(db, `tasks/${TEAMSPACE_ID}`);
  onValue(tRef, (snap) => {
    clearLists();
    if (!snap.exists()) {
      ensureHints();
      return;
    }
    const pairs = Object.entries(snap.val() || {})
      .sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));
    for (const [id, t] of pairs) {
      const node = renderTask(id, t);
      getListFor(t.status || "todo").appendChild(node);
    }
    ensureHints();
  });
}

function getListFor(status) {
  if (status === "in_progress") return listProg;
  if (status === "done") return listDone;
  return listTodo;
}
function clearLists() { [listTodo, listProg, listDone].forEach((l) => (l.innerHTML = "")); }
function ensureHints() {
  [listTodo, listProg, listDone].forEach((l) => {
    if (l.children.length === 0) {
      const hint = document.createElement("div");
      hint.className = "empty-hint";
      hint.textContent = "Kart yok.";
      l.appendChild(hint);
    }
  });
}

function renderTask(id, t) {
  const wrap = document.createElement("div");
  wrap.className = "task";
  wrap.innerHTML = `
    <div class="title">${t.title || "Başlıksız"}</div>
    <div class="row">
      <select class="st">
        <option value="todo">Yapılacak</option>
        <option value="in_progress">Devam Ediyor</option>
        <option value="done">Tamamlandı</option>
      </select>
      <button class="ghost edit">Düzenle</button>
      <button class="ghost del">Sil</button>
    </div>
    <div class="row" style="font-size:12px; opacity:.7">
      ${t.description ? `<span>${t.description}</span>` : ""}
      <span style="margin-left:auto">${new Date(t.createdAt || Date.now()).toLocaleString("tr-TR")}</span>
    </div>
  `;

  const st = wrap.querySelector(".st");
  st.value = t.status || "todo";
  st.addEventListener("change", async () => {
    await update(ref(db, `tasks/${TEAMSPACE_ID}/${id}`), { status: st.value });
  });

  wrap.querySelector(".edit").addEventListener("click", async () => {
    const newTitle = prompt("Yeni başlık:", t.title || "");
    if (newTitle === null) return;
    const newDesc = prompt("Yeni açıklama:", t.description || "");
    await update(ref(db, `tasks/${TEAMSPACE_ID}/${id}`), {
      title: (newTitle || "").trim() || t.title,
      description: (newDesc || "").trim(),
    });
  });

  wrap.querySelector(".del").addEventListener("click", async () => {
    if (!confirm("Görev silinsin mi?")) return;
    await remove(ref(db, `tasks/${TEAMSPACE_ID}/${id}`));
  });

  return wrap;
}
