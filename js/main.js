// =====================
// 初期化
// =====================
document.addEventListener('DOMContentLoaded', async () => {
  if (typeof DataStore !== 'undefined') {
    await DataStore.init();
  }
  Master.init();
  Calendar.init();
  Order.init();
  Timer.init();
  if (typeof Review !== 'undefined') {
    Review.init();
    Review.render();
  }
});
