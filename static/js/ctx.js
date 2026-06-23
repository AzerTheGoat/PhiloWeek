// ── Context Menu ──────────────────────────────────────────────────────────────
const CtxMenu = {
  show(x, y, items) {
    const menu    = el('ctx-menu');
    const editBtn = el('ctx-edit');
    const delBtn  = el('ctx-delete');
    const sep     = el('ctx-sep');

    if (items.edit) {
      editBtn.classList.remove('hidden');
      editBtn.onclick = () => { this.hide(); items.edit(); };
    } else {
      editBtn.classList.add('hidden');
    }

    if (items.delete) {
      delBtn.classList.remove('hidden');
      delBtn.onclick = () => { this.hide(); items.delete(); };
    } else {
      delBtn.classList.add('hidden');
    }

    sep.classList.toggle('hidden', !items.edit || !items.delete);

    menu.classList.remove('hidden');
    menu.style.left = `${x}px`;
    menu.style.top  = `${y}px`;

    requestAnimationFrame(() => {
      const r = menu.getBoundingClientRect();
      if (r.right  > window.innerWidth)  menu.style.left = `${x - r.width}px`;
      if (r.bottom > window.innerHeight) menu.style.top  = `${y - r.height}px`;
    });
  },

  hide() { el('ctx-menu').classList.add('hidden'); },
};

// ── Confirm Modal ─────────────────────────────────────────────────────────────
function showConfirm({ icon = '🗑️', title, body, label = 'Supprimer', onConfirm }) {
  el('confirm-icon').textContent  = icon;
  el('confirm-title').textContent = title;
  el('confirm-body').textContent  = body;
  el('confirm-ok').textContent    = label;
  el('confirm-ok').onclick = () => { hideConfirm(); onConfirm(); };
  el('confirm-modal').classList.remove('hidden');
}

function hideConfirm() { el('confirm-modal').classList.add('hidden'); }
