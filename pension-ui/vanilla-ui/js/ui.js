export function toast(message, type = "info") {
  const area = document.getElementById("toastArea");
  if (!area) return;

  const colors = {
    info: "border-primary",
    success: "border-success",
    error: "border-danger",
    warning: "border-warning",
  };

  const div = document.createElement("div");
  div.className = `soft-card p-3 mb-2 border-start border-4 ${colors[type] || colors.info}`;
  div.innerHTML = `
    <div class="d-flex align-items-start justify-content-between gap-3">
      <div>
        <div class="fw-bold">${type.toUpperCase()}</div>
        <div class="text-secondary small">${message}</div>
      </div>
      <button class="btn btn-sm btn-light">✕</button>
    </div>
  `;

  div.querySelector("button").onclick = () => div.remove();
  area.appendChild(div);

  setTimeout(() => {
    div.remove();
  }, 2800);
}

export function setLoading(btn, isLoading, loadingText = "Working...") {
  if (!btn) return;
  btn.disabled = isLoading;
  btn.dataset.oldText = btn.dataset.oldText || btn.innerHTML;

  if (isLoading) {
    btn.innerHTML = `
      <span class="spinner-border spinner-border-sm me-2" role="status"></span>
      ${loadingText}
    `;
  } else {
    btn.innerHTML = btn.dataset.oldText;
  }
}
