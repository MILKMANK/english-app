// download.js — отдать файл пользователю: на iPhone меню «Поделиться» (сохранить в Файлы), на компьютере обычная загрузка.
export async function deliverFile(file) {
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return 'shared'; }
    catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'downloaded';
}
