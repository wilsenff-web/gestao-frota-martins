(() => {
 const work = 'Viagem de trabalho';
 const positive = value => Number.isFinite(Number(value)) && Number(value)>0 ? Number(value) : 0;
 const tripDay = trip => trip.data || trip.data_fim;
 const effectiveDaily = (trip, driver) => positive(trip.diaria_veiculo_snapshot) || positive(driver.diaria_padrao);
 const half = daily => Math.round(daily * 50) / 100;
 function aggregateDaily(trips, driver) {
  const days = new Map();
  for (const trip of trips) {
   const day = tripDay(trip);
   if (!days.has(day)) days.set(day, []);
   days.get(day).push(trip);
  }
  let cents = 0;
  for (const rows of days.values()) {
   const modern = rows.some(row => positive(row.diaria_veiculo_snapshot));
   const vehicles = new Map();
   const distinct = new Set(rows.map(row => row.veiculo_id).filter(Boolean));
   for (const row of rows) {
    if (row.modalidade_diaria === 'combinada') {
     cents += Math.round(positive(row.valor) * 100);
     continue;
    }
    const daily = effectiveDaily(row, driver);
    const amount = Math.round(100 * (row.modalidade_diaria === 'meia' || (modern && distinct.size>1) ? half(daily) : daily));
    if (!modern || !row.veiculo_id) cents += amount;
    else vehicles.set(row.veiculo_id, Math.max(vehicles.get(row.veiculo_id) || 0, amount));
   }
   for (const amount of vehicles.values()) cents += amount;
  }
  return cents / 100;
 }

 const openForm = modal;
 modal = function(table, recordId, ...args) {
  const result = openForm(table,recordId,...args);
  if (table !== 'veiculos') return result;
  const form = document.querySelector('#modal #form');
  if (!form || current?.table !== 'veiculos') return result;
  const vehicle = get('veiculos',recordId);
  const field = document.createElement('div');
  field.className = 'field wide';
  field.innerHTML = '<label for="vehicle-work-daily">Diária inteira de trabalho (R$)</label><input class="control" type="number" id="vehicle-work-daily" name="diaria_trabalho" min="0.01" step="0.01"><small class="muted" data-vehicle-half></small>';
  form.querySelector('.grid').append(field);
  const input = field.querySelector('input');
  const output = field.querySelector('small');
  input.value = vehicle.diaria_trabalho ?? '';
  const preview = () => {
   const daily = positive(input.value);
   output.textContent = daily ? 'Meia diária: ' + money(half(daily)) : 'Em branco, usa a diária padrão do motorista.';
  };
  input.addEventListener('input',preview);
  preview();
  return result;
 };

 const originalPreview = updateDriverDailyPreview;
 updateDriverDailyPreview = function(form) {
  originalPreview(form);
  const block = form?.querySelector('[data-diaria-preview]');
  if (!block || block.hidden) return;
  const old = get('viagens',current?.recordId);
  const car = form.elements.veiculo_id?.value || old.veiculo_id;
  const vehicle = get('veiculos',car);
  const snapshot = car === old.veiculo_id ? positive(old.diaria_veiculo_snapshot) : 0;
  const daily = snapshot || (!old.id || old.status !== 'Concluída' || car !== old.veiculo_id ? positive(vehicle.diaria_trabalho) : 0);
  if (!daily) return;
  const driver = get('motoristas',form.elements.motorista_id?.value || myProfile?.motorista_id || old.motorista_id);
  const rate = positive(driver.excedente_valor_km);
  const describe = amount => money(amount) + (rate ? ' · ' + (amount/rate).toLocaleString('pt-BR',{maximumFractionDigits:2}) + ' km incluídos' : '');
  block.querySelector('[data-diaria-preview-content]').textContent =
   (vehicle.modelo || vehicle.placa || 'Veículo') + ' · Inteira: ' + describe(daily) + '. Meia: ' + describe(half(daily)) + '. Se usar dois carros no mesmo dia, o fechamento usa meia diária de cada.';
 };
 document.addEventListener('change',e=>{
  if (e.target.name==='veiculo_id' || e.target.name==='data') updateDriverDailyPreview(e.target.form);
 });
 const openWeekly = weeklySettlementPreview;
 weeklySettlementPreview = function() {
  if (isDriver()) return '';
  const reference = new Date(agoraLocal().data+'T12:00:00');
  reference.setDate(reference.getDate()-((reference.getDay()+6)%7));
  const start = reference.toISOString().slice(0,10), last = new Date(reference);
  last.setDate(last.getDate()+5);
  const end = last.toISOString().slice(0,10);
  const trips = db.viagens.filter(v=>v.status==='Concluída'&&usage(v)===work&&tripDay(v)>=start&&tripDay(v)<=end);
  if (!trips.some(v=>positive(v.diaria_veiculo_snapshot))) return openWeekly();
  const rows = db.motoristas.map(driver=>{
   const mine = trips.filter(v=>v.motorista_id===driver.id);
   if (!mine.length) return '';
   const missing = mine.filter(v=>v.modalidade_diaria==='combinada'&&!positive(v.valor));
   const rate = positive(driver.excedente_valor_km), base = aggregateDaily(mine,driver);
   const km = mine.reduce((sum,v)=>sum+tripKm(v),0);
   const allowance = rate ? base/rate : 0, excess = rate ? Math.max(0,km-allowance) : 0;
   const displayKm = value => value.toLocaleString('pt-BR',{maximumFractionDigits:1})+' KM';
   return '<div class="panel" style="margin-top:12px"><strong>'+esc(driver.nome)+'</strong><p class="muted">'+displayKm(km)+' rodados</p><div class="detail-grid">'
    +detailCell('Diárias da semana',money(base))
    +(rate ? detailCell('Franquia semanal',displayKm(allowance))+detailCell('KM excedentes',displayKm(excess))+detailCell('Excedente estimado',money(excess*rate))+detailCell('Total estimado',money(base+excess*rate)) : '')
    +'</div>'
    +(!rate ? '<p class="muted">Cadastre a tarifa por KM deste motorista para calcular o excedente.</p>' : '')
    +(missing.length ? '<p class="muted">Aguardando valor combinado em '+missing.length+' viagem(ns). Total provisório.</p>' : '<button type="button" class="btn" data-discount-driver="'+esc(driver.id)+'">Desconto em pendência deste motorista</button>')+'</div>';
  }).join('');
  return '<div class="panel" style="margin-top:24px"><h2>Prévia do fechamento semanal · segunda a sábado</h2><p class="muted">'+date(start)+' a '+date(end)+' · Meia diária de cada veículo em dias com troca. O excedente é estimado no fechamento semanal.</p>'+rows+'</div>';
 };
})();
