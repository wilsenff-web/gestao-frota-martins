(() => {
 function historicalMileage(car, day, time, ignoredTrip, ignoredService) {
  const readings = [];
  const add = (date, clock, value) => {
   if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || date > day) return;
   if (time && date === day && (!clock || clock.slice(0,5) > time.slice(0,5))) return;
   if (value != null && String(value).trim() && Number.isFinite(Number(value)) && Number(value) >= 0) {
    readings.push({ day: date, clock: clock || '', km: Number(value) });
   }
  };
  for (const trip of db.viagens) {
   if (trip.veiculo_id !== car || trip.id === ignoredTrip) continue;
   add(trip.data, trip.hora, trip.km_inicial);
   if (trip.status === 'Concluída') add(trip.data_fim || trip.data, trip.hora_fim, trip.km_final);
  }
  for (const service of db.manutencoes) {
   if (service.veiculo_id === car && service.id !== ignoredService) add(service.data, '', service.km);
  }
  return readings.sort((a,b) => b.day.localeCompare(a.day) || (time ? b.clock.localeCompare(a.clock) : 0) || b.km-a.km)[0];
 }
 function applyMileage(form) {
  const fields = form.elements;
  const service = form.id === 'maintenance-form';
  const trip = form.id === 'form' && current?.table === 'viagens' && !current.isFinish;
  const number = service ? fields.km || fields.km_base : trip ? fields.km_inicial : null;
  const day = (fields.data_base || fields.data)?.value;
  const car = fields.veiculo_id?.value;
  if (!number || !car) return;
  const historical = day && (day !== agoraLocal().data || fields.lancamento_retroativo?.checked);
  const reading = historical ? historicalMileage(car, day, trip ? fields.hora?.value : '', trip ? current.recordId : '', service && maintenanceCurrent?.kind === 'service' ? maintenanceCurrent.recordId : '') : null;
  number.value = historical ? reading?.km ?? '' : day ? (service ? maintenanceKm(car) : ultimoKm(car, current.recordId)) : '';
  let hint = number.parentElement.querySelector('[data-historical-km]');
  if (!hint) {
   hint = document.createElement('small');
   hint.className = 'muted';
   hint.dataset.historicalKm = '';
   hint.setAttribute('aria-live', 'polite');
   number.after(hint);
  }
  hint.textContent = !day ? 'Selecione a data.' : !historical ? '' : reading ? (reading.day === day ? 'KM registrado nesta data. Confira se corresponde ao lançamento.' : 'Último KM registrado antes desta data: ' + reading.day.split('-').reverse().join('/') + '. Ajuste se necessário.') : 'Sem KM registrado até essa data. Informe o KM do lançamento.';
  if (trip) {
   number.dispatchEvent(new Event('input', {bubbles:true}));
  }
 }
 document.addEventListener('change', event => {
  const form = event.target.form;
  if (!form || !['veiculo_id','data','data_base','hora','lancamento_retroativo'].includes(event.target.name)) return;
  if (form.id === 'maintenance-form' && event.target.name === 'hora') return;
  applyMileage(form);
 });
})();
