(() => {
 const renderChrome = renderDriverChrome;
 const application = document.getElementById('application');
 const update = document.getElementById('app-refresh-control');
 const version = document.getElementById('app-version-label');
 const fallbackClock = new Intl.DateTimeFormat('pt-BR', {timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
 function updateFallbackClock(meta) {
  meta.querySelector('.driver-header-online').textContent = navigator.onLine ? '● Online' : '● Sem conexão';
  meta.querySelector('.driver-header-time').textContent = fallbackClock.format(new Date());
 }
 if (typeof updateDriverHeaderClock !== 'function') setInterval(() => {
  const meta = document.querySelector('#driver-topbar .driver-header-meta');
  if (meta) updateFallbackClock(meta);
 }, 1000);
 renderDriverChrome = function () {
  // The existing controls keep their update handler and their current version.
  if (update?.closest('#driver-drawer')) application.append(update, version);
  renderChrome();
  if (!isDriver()) return;
  const header = document.getElementById('driver-topbar');
  const title = header.querySelector('.driver-brand-title') || header.querySelector('.driver-brand > span:last-child');
  title.classList.add('driver-brand-title');
  const subtitle = document.createElement('span');
  subtitle.className = 'driver-area-subtitle';
  subtitle.textContent = 'Minha área';
  title.textContent = db.config.empresa || 'Gestão de Frota Martins';
  title.append(subtitle);
  let meta = header.querySelector('.driver-header-meta');
  if (!meta) {
   meta = document.createElement('div');
   meta.className = 'driver-header-meta';
   meta.innerHTML = '<span class="driver-header-online"></span><strong class="driver-header-time"></strong>';
   updateFallbackClock(meta);
  }
  header.append(meta);
  const homeHeading = document.querySelector('.driver-home-heading');
  if (homeHeading) homeHeading.classList.add('driver-home-accessible-heading');
  const drawer = document.getElementById('driver-drawer');
  const signout = drawer.querySelector('[data-online="signout"]');
  if (update && version && signout) {
   const controls = document.createElement('div');
   controls.className = 'driver-menu-app-controls';
   controls.append(update, version);
   signout.before(controls);
  }
 };
})();
