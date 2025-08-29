// dragdrop-utils.js (generic)
import { ref, update } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

/** Kartları tekrar draggable yapmak için yardımcı */
export function bindDraggables() {
  document.querySelectorAll('.task-card').forEach(card => {
    card.setAttribute('draggable', 'true');
    card.addEventListener('dragstart', (e) => {
      const id = card.dataset.taskId;
      if (id) e.dataTransfer.setData('text/plain', id);
    });
  });
}

/**
 * Sürükle-bırak kurulumunu yapar.
 * @param {Database} db Firebase Realtime DB instance
 * @param {string} basePath ör: "tasks/{uid}" ya da "tasks/{teamspaceId}"
 */
export function dragAndDropForTasksGeneric(db, basePath) {
  // Drop alanları
  document.querySelectorAll('.task-list').forEach(list => {
    list.addEventListener('dragover', (e) => e.preventDefault());
    list.addEventListener('drop', async (e) => {
      e.preventDefault();
      const taskId = e.dataTransfer.getData('text/plain');
      const newStatus = list.dataset.status;
      if (!taskId || !newStatus) return;
      try {
        await update(ref(db, `${basePath}/${taskId}`), { status: newStatus });
      } catch (err) {
        console.error('Görev statüsü güncellenemedi:', err);
      }
    });
  });

  bindDraggables();
}
