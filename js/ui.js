function openModal(title, body, footer) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = body;
  document.getElementById('modal-footer').innerHTML = footer || `<button class="btn btn-ghost" onclick="closeModalDirect()">Close</button>`;
  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal(e) { if (e.target === document.getElementById('modal-overlay')) closeModalDirect(); }

function closeModalDirect() { document.getElementById('modal-overlay').classList.remove('open'); }

function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const icons = { success:'✅', error:'❌', info:'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type]}</span> ${msg}`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity='0'; toast.style.transform='translateY(10px)'; toast.style.transition='all 0.3s'; setTimeout(()=>toast.remove(),300); }, 3000);
}

export const ui = { openModal, closeModal, closeModalDirect, showToast };
