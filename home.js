// home.js – GÜNCEL
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { ref, get, child, query, orderByChild, limitToLast }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { applySavedTheme, toggleTheme } from "./theme.js";

const $ = (s, r = document) => r.querySelector(s);

const loginTextEl = $("#loginText");
const usernameEl  = $("#username");
const profileBtn  = $("#profileBtn");
const profileImg  = $("#profileImage");
const logoutBtn   = $("#logoutBtn");

const lastUsedBox = $("#lastUsed");
const lastNameEl  = $("#lastTeamspaceName");
const lastStatsEl = $("#lastTeamspaceStats");
const openLastBtn = $("#openLastTeamspaceBtn");

const recentTasksEl = $("#recentTasks");
const recentFeedEl  = $("#recentFeed");

$("#goTasksBtn")?.addEventListener("click", () => location.href = "dashboard.html");
$("#goReportsBtn")?.addEventListener("click", () => location.href = "dashboard.html#feedView");
$("#goTeamspacesBtn")?.addEventListener("click", () => location.href = "teamspaces.html");

const themeBtn = $("#toggleThemeBtn");
applySavedTheme();
themeBtn?.addEventListener("click", () => toggleTheme());

onAuthStateChanged(auth, async (user) => {
  if (!user) { location.href = "login.html"; return; }

  profileImg.src = user.photoURL || "placeholder_light_gray_block.png";
  profileImg.alt = `${user.displayName || "Kullanıcı"} profil resmi`;
  profileBtn?.addEventListener("click", () => location.href = "profile.html");
  logoutBtn?.addEventListener("click", async (e) => {
    e.stopPropagation();
    await signOut(auth);
    localStorage.removeItem("username");
    location.href = "login.html";
  });

  let displayName = localStorage.getItem("username") || user.email.split("@")[0];
  try {
    const snap = await get(child(ref(db), `users/${user.uid}`));
    if (snap.exists() && snap.val()?.name) {
      displayName = snap.val().name;
      localStorage.setItem("username", displayName);
    }
  } catch {}
  loginTextEl.textContent = displayName;
  if (usernameEl) usernameEl.textContent = displayName;

  await loadLastTeamspace();
  await loadRecentTasks(user.uid);
  await loadRecentFeed(user.uid);
});

async function loadLastTeamspace() {
  const id = localStorage.getItem("lastTeamspaceId");
  const cachedName = localStorage.getItem("lastTeamspaceName");
  if (!id) { lastUsedBox.style.display = "none"; return; }

  lastUsedBox.style.display = "block";
  lastNameEl.textContent = cachedName || "Yükleniyor...";

  try {
    const tsSnap = await get(child(ref(db), `teamspaces/${id}`));
    if (tsSnap.exists()) {
      const data = tsSnap.val();
      lastNameEl.textContent = data.name || cachedName || "(adsız teamspace)";
      // Son sürüm: istatistik için teamspace altındaki görev sayısı
      const tSnap = await get(child(ref(db), `teamspaces/${id}/tasks`));
      const count = tSnap.exists() ? Object.keys(tSnap.val()).length : 0;
      lastStatsEl.textContent = `Bu alanda ${count} görev var.`;
    } else {
      lastStatsEl.textContent = "Bu teamspace artık bulunamıyor.";
    }
  } catch {
    lastStatsEl.textContent = "";
  }
  openLastBtn.onclick = () => location.href = `teamspace-detail.html?id=${id}`;
}

async function loadRecentTasks(uid) {
  recentTasksEl.innerHTML = "Yükleniyor...";
  try {
    // Kişisel panon: tasks/{uid}
    const q = query(ref(db, `tasks/${uid}`), orderByChild("createdAt"), limitToLast(5));
    const snap = await get(q);
    if (!snap.exists()) {
      recentTasksEl.innerHTML = `<div class="empty-hint">Henüz kişisel görevin yok. Dashboard’dan ilkini ekle.</div>`;
      return;
    }
    const items = Object.entries(snap.val()).sort((a,b)=> (b[1].createdAt||0)-(a[1].createdAt||0));
    recentTasksEl.innerHTML = "";
    items.forEach(([id, t]) => {
      const row = document.createElement("div");
      row.className = "task-card";
      row.style.cursor = "pointer";
      row.innerHTML = `
        <div style="flex:1;">
          <strong>${t.title || "Adsız"}</strong><br/>
          <span class="task-meta">${formatStatus(t.status || "todo")} • ${formatDate(t.createdAt)}</span>
        </div>
        <button class="btn" title="Panoya git">Aç</button>`;
      row.onclick = () => location.href = "dashboard.html";
      recentTasksEl.appendChild(row);
    });
  } catch {
    recentTasksEl.innerHTML = `<div class="empty-hint">Görevler yüklenemedi.</div>`;
  }
}

async function loadRecentFeed(uid) {
  recentFeedEl.innerHTML = "Yükleniyor...";
  try {
    // TÜM teamspace'lerdeki postları tara ve sana ait olanları al
    const allTS = await get(ref(db, `teamspaces`));
    const mine = [];
    if (allTS.exists()) {
      const tss = allTS.val();
      for (const [tsId, ts] of Object.entries(tss)) {
        const ps = await get(child(ref(db), `teamspaces/${tsId}/posts`));
        if (!ps.exists()) continue;
        for (const [pid, p] of Object.entries(ps.val())) {
          if (p?.authorUid === uid) {
            mine.push({
              tsName: ts.name || tsId,
              createdAt: p.createdAt || 0,
              text: p.text || ""
            });
          }
        }
      }
    }
    if (mine.length === 0) {
      recentFeedEl.innerHTML = `<div class="empty-hint">Henüz rapor yok. Dashboard → Feed’ten paylaşabilirsin.</div>`;
      return;
    }
    mine.sort((a,b)=> b.createdAt - a.createdAt);
    recentFeedEl.innerHTML = "";
    mine.slice(0,5).forEach(p=>{
      const card = document.createElement("div");
      card.className = "post-card";
      card.innerHTML = `
        <div class="post-header"><strong>${p.tsName}</strong> · ${formatDate(p.createdAt)}</div>
        <div class="post-content">${escapeHtml(p.text).replace(/\n/g,"<br/>")}</div>`;
      recentFeedEl.appendChild(card);
    });
  } catch (e) {
    recentFeedEl.innerHTML = `<div class="empty-hint">Raporlar yüklenemedi.</div>`;
  }
}

function formatStatus(s) { return s==="todo"?"Yapılacak":s==="in_progress"?"Devam Ediyor":s==="done"?"Tamamlandı":"Bilinmiyor"; }
function formatDate(ts) { if (!ts) return ""; try { return new Date(ts).toLocaleString("tr-TR"); } catch { return ""; } }
function escapeHtml(str) { return (str||"").replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m])); }
