// profile.js (final)
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { ref, get, update, child } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

const loginText   = document.getElementById('loginText');
const nameSpan    = document.getElementById('profile-name');
const emailSpan   = document.getElementById('profile-email');
const logoutBtn   = document.getElementById('logoutBtn');
const themeToggle = document.getElementById('themeToggle');
const editNameBtn = document.getElementById('editNameBtn');

let currentUser = null;

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    loginText.textContent = "Profil";
    emailSpan.textContent = user.email;

    try {
      const snap = await get(child(ref(db), `users/${user.uid}`));
      if (snap.exists()) {
        const userData = snap.val();
        nameSpan.textContent = userData.name || "İsimsiz";
      } else {
        nameSpan.textContent = "Kullanıcı";
      }
    } catch (err) { console.error("Veri alınamadı:", err); }
  } else {
    location.href = "login.html";
  }
});

themeToggle.addEventListener("click", () => {
  document.body.classList.toggle("dark-theme");
  themeToggle.textContent = document.body.classList.contains("dark-theme") ? "Açık Tema" : "Koyu Tema";
});

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  localStorage.removeItem("username");
  location.href = "login.html";
});

editNameBtn.addEventListener("click", async () => {
  const newName = prompt("Yeni adınızı girin:");
  if (newName && currentUser) {
    try {
      await update(ref(db, `users/${currentUser.uid}`), { name: newName });
      localStorage.setItem('username', newName);
      nameSpan.textContent = newName;
      alert("İsim güncellendi!");
    } catch (err) {
      alert("Güncelleme başarısız.");
      console.error(err);
    }
  }
});
