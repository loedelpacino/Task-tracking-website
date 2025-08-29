// teamspaces.js (final)
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { ref, push, set, onValue, get, remove } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const $  = (s, r=document)=>r.querySelector(s);

const listEl      = $("#list");
const emptyEl     = $("#emptyState");
const searchEl    = $("#searchBox");
const createBtn   = $("#createBtn");
const refreshBtn  = $("#refreshBtn");
const loginTextEl = $("#loginText");
const profileBtn  = $("#profileBtn");

let USER = null;
let ALL  = {};

function render(items){
  listEl.innerHTML = "";
  const entries = Object.entries(items);
  if (entries.length === 0) { emptyEl.style.display = "block"; return; }
  emptyEl.style.display = "none";
  for (const [id, ts] of entries){
    const card = document.createElement("div");
    card.className = "ts-card";
    card.setAttribute("role","button");
    card.tabIndex = 0;
    card.addEventListener("click", () => goDetail(id));
    card.addEventListener("keypress", (e)=>{ if(e.key==="Enter") goDetail(id); });
    card.innerHTML = `
      <h4>${ts.name}</h4>
      <p>${ts.description || "Açıklama yok."}</p>
      <div class="meta">
        <span>${new Date(ts.createdAt || Date.now()).toLocaleDateString("tr-TR")}</span>
        <div class="ts-actions"></div>
      </div>
    `;
    if (USER && ts.createdBy === USER.uid){
      const del = document.createElement("button");
      del.className = "ghost";
      del.textContent = "Sil";
      del.addEventListener("click", (e) => { e.stopPropagation(); deleteTeamspace(id); });
      card.querySelector(".ts-actions").appendChild(del);
    }
    listEl.appendChild(card);
  }
}
function filterAndRender(){
  const q = (searchEl.value || "").toLowerCase().trim();
  if(!q){ render(ALL); return; }
  const picked = {};
  for (const [id, ts] of Object.entries(ALL)){
    const hay = `${ts.name||""} ${ts.description||""}`.toLowerCase();
    if (hay.includes(q)) picked[id] = ts;
  }
  render(picked);
}
function goDetail(id){ location.href = `teamspace-detail.html?id=${id}`; }

createBtn?.addEventListener("click", async () => {
  if(!USER) return alert("Lütfen giriş yapın.");
  const name = $("#teamspace-name").value.trim();
  const description = $("#teamspace-description").value.trim();
  if (!name) return alert("Teamspace adı gerekli.");
  try{
    createBtn.disabled = true;
    const newRef = push(ref(db, "teamspaces"));
await set(newRef, {
  name, description, permission: "public",
  createdBy: USER.uid, createdAt: Date.now(),
  members: { [USER.uid]: true }   // kurucu üye olsun
});

    $("#teamspace-name").value = ""; $("#teamspace-description").value = "";
  }catch(err){ console.error(err); alert("Teamspace oluşturulamadı."); }
  finally{ createBtn.disabled = false; }
});

refreshBtn?.addEventListener("click", async ()=>{
  const snap = await get(ref(db, "teamspaces"));
  ALL = snap.exists() ? snap.val() : {};
  filterAndRender();
});

searchEl?.addEventListener("input", () => filterAndRender());
profileBtn?.addEventListener("click", ()=> location.href="profile.html");

onAuthStateChanged(auth, (user)=>{
  if(!user){ location.href = "login.html"; return; }
  USER = user;
  loginTextEl.textContent = localStorage.getItem("username") || user.email.split("@")[0];
  $("#profileImage").src = user.photoURL || "placeholder_light_gray_block.png";

  const tsRef = ref(db, "teamspaces");
  onValue(tsRef, (snap)=>{
    ALL = snap.exists() ? snap.val() : {};
    filterAndRender();
  });
});

async function deleteTeamspace(id){
  if(!confirm("Bu teamspace silinsin mi?")) return;
  await remove(ref(db, `teamspaces/${id}`));
  await remove(ref(db, `tasks/${id}`));
}
