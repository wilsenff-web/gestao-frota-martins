(() => {
 const cdn = 'https://cdn.jsdelivr.net/npm/';
 const ocrPackage = cdn + 'tesseract.js@5.1.1/dist/';
 let ocrLibrary;
 const paymentForms = new WeakMap();

 function driverTripCard(trip) {
  const active = trip.status === 'Em andamento';
  const pending = !active && (+trip.valor > paidTrip(trip) || trip.comprovante_status === 'Pendente' || trip.comprovante_status === 'Correção solicitada');
  const state = active ? 'active' : pending ? 'pending' : 'done';
  const label = active ? 'Em andamento' : pending ? 'Pendente' : 'Finalizada';
  const metric = (label, value) => '<div class="trip-card-metric"><span>' + label + '</span><strong>' + value + '</strong></div>';
  const km = value => value !== '' && value != null ? Number(value).toLocaleString('pt-BR') : '—';
  return '<article class="frota-driver-trip"><div class="head"><strong>' + driverIcon('car') + esc(tripVehicleLabel(trip)) + '</strong><span>' + esc(date(trip.data)) + '</span></div>'
   + '<p>' + driverIcon('route') + esc(trip.origem || '—') + ' → ' + esc(trip.destino || '—') + '</p>'
   + '<div class="trip-card-metrics">' + metric('KM inicial', km(trip.km_inicial)) + metric('KM final', km(trip.km_final)) + metric('Total KM rodado', active ? '—' : km(tripKm(trip))) + '</div>'
   + '<div class="frota-trip-summary"><strong><span aria-hidden="true">＄</span> ' + money(trip.valor) + '</strong><strong>' + driverIcon('route') + esc(usage(trip)) + '</strong><strong class="frota-trip-state ' + state + '"><span aria-hidden="true">' + (active ? '◷' : pending ? '!' : '✓') + '</span> ' + label + '</strong></div>'
   + '<div class="frota-trip-actions">' + (active ? btn('Concluir viagem', 'finish', trip.id, 'btn') : '') + btn('Detalhes', 'details', trip.id, 'mini') + (receiptDocuments(trip).length ? receiptButton('trip', trip.id, 'Ver recibo') : '') + '</div></article>';
 }

 if (typeof tripCard === 'function') {
  const existingCard = tripCard;
  tripCard = trip => isDriver() ? driverTripCard(trip) : existingCard(trip);
 } else {
  const existingTrips = trips;
  trips = function () {
   const content = existingTrips();
   if (!isDriver()) return content;
   const rows = newestTrips(db.viagens.filter(v => v.motorista_id === myProfile.motorista_id && (tripCategory === 'Todas' || tripCategoryOf(v) === tripCategory) && (tripTab === 'Todas' || v.status === tripTab) && matchesTripSearch(v, query)));
   return content.slice(0, content.lastIndexOf('<div class="panel">')) + '<div class="trip-card-list">' + (rows.map(driverTripCard).join('') || '<div class="empty">Nenhuma viagem encontrada nesta categoria.</div>') + '</div>';
  };
 }

 const existingHome = driverHome;
 driverHome = function () {
  const content = existingHome();
  const active = newestTrips(db.viagens.filter(v => v.status === 'Em andamento' && v.motorista_id === myProfile.motorista_id));
  const oldPanel = content.indexOf('<div class="panel driver-active">');
  return oldPanel < 0 ? content : content.slice(0, oldPanel) + '<div class="trip-card-list">' + active.map(driverTripCard).join('') + '</div></div>';
 };

 function receiptButton(kind, recordId, label, style = 'mini') {
  return '<button type="button" class="' + style + '" data-frota-receipt="' + kind + '" data-id="' + esc(recordId) + '">' + esc(label) + '</button>';
 }

 function receiptDocuments(trip) {
  const documents = [];
  for (const p of newestRecords(db.pagamentos.filter(p => p.viagem_id === trip.id))) {
   if (p.recibo) documents.push(['digital', p.id, 'Recibo · ' + date(p.recibo.data) + ' · ' + money(p.recibo.valor)]);
   if (p.arquivo) documents.push(['pagamentos', p.id, 'Comprovante · ' + date(p.data) + ' · ' + money(p.valor)]);
  }
  if (trip.arquivo) documents.push(['viagens', trip.id, 'Comprovante da viagem']);
  return documents;
 }

 const existingPaymentModal = paymentModal;
 paymentModal = function (tripId, recordId) {
  const prior = document.querySelector('#form');
  existingPaymentModal(tripId, recordId);
  const form = document.querySelector('#form');
  if (form && form !== prior && current?.isPayment) setupPayment(form, 'pagamentos', recordId);
 };

 const existingModal = modal;
 modal = function (table, recordId, isBaixa) {
  const prior = document.querySelector('#form');
  existingModal(table, recordId, isBaixa);
  const form = document.querySelector('#form');
  if (table === 'pendencias' && isBaixa && form && form !== prior) setupPayment(form, 'baixas', '');
 };

 const existingDetails = tripDetails;
 tripDetails = function (recordId) {
  existingDetails(recordId);
  const dialog = document.querySelector('#modal .modal');
  if (dialog && receiptDocuments(get('viagens', recordId)).length) dialog.querySelector('.head')?.insertAdjacentHTML('afterend', '<div class="frota-trip-actions">' + receiptButton('trip', recordId, 'Ver recibo') + '</div>');
 };

 function pendingReceipts() {
  const docs = newestRecords(db.baixas).flatMap(p => {
   const label = ' · ' + date(p.data) + ' · ' + money(p.valor);
   return [
    p.recibo && receiptButton('baixa-digital', p.id, 'Recibo' + label),
    p.arquivo && receiptButton('baixas', p.id, 'Comprovante' + label)
   ].filter(Boolean);
  });
  return docs.length ? '<section class="panel"><h2>Recibos de pendências</h2><div class="frota-receipt-list">' + docs.join('') + '</div></section>' : '';
 }
 const existingPending = driverPending;
 driverPending = () => existingPending() + pendingReceipts();
 const existingFinance = finance;
 finance = () => existingFinance() + (tab === 'Pendências' && pendenciaTab === 'Outras pendências' ? pendingReceipts() : '');

 function setupPayment(form, table, recordId) {
  if (table === 'baixas' && !form.elements.forma) form.querySelector('.grid').insertAdjacentHTML('beforeend', select('Forma de pagamento', 'forma', paymentMethods, 'Pix'));
  form.dataset.receiptPayment = table;
  const existing = get(table, recordId);
  paymentForms.set(form, { id: recordId || crypto.randomUUID(), recordId, parentId: current.recordId });
  form.querySelector('.grid').insertAdjacentHTML('beforeend',
   '<fieldset class="field wide frota-ocr"><legend>Comprovante do pagamento</legend>'
   + '<label for="payment-proof-mode">Como registrar</label><select class="control" id="payment-proof-mode">'
   + '<option value="">Sem novo comprovante</option><option value="original">Anexar original</option>'
   + '<option value="digital">Escanear e gerar recibo digital</option><option value="both">Escanear, gerar recibo e preservar original</option></select>'
   + '<div data-payment-files hidden><label for="payment-proof-file">Escolher arquivo (JPEG, PNG ou PDF)</label><input class="control" id="payment-proof-file" type="file" accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf">'
   + '<label for="payment-proof-camera">Fotografar com a câmera</label><input class="control" id="payment-proof-camera" type="file" accept="image/*" capture="environment">'
   + '<button class="mini" data-scan-proof type="button" hidden>Escanear comprovante</button></div>'
   + '<label for="payment-reference">Referência do pagamento (opcional)</label><input class="control" id="payment-reference" maxlength="120" value="' + esc(existing.referencia_pagamento || '') + '">'
   + '<p data-scan-feedback role="status" class="muted"></p><details data-scan-review hidden><summary>Texto identificado</summary><pre></pre></details>'
   + '<small>Pagamentos em dinheiro geram recibo digital automaticamente, inclusive quando parciais.</small>'
   + (existing.recibo ? '<p>' + receiptButton(table === 'baixas' ? 'baixa-digital' : 'digital', existing.id, 'Abrir recibo emitido') + '</p>' : '') + '</fieldset>');
  const mode = form.querySelector('#payment-proof-mode');
  const ref = form.querySelector('#payment-reference');
  const inputs = [...form.querySelectorAll('.frota-ocr input[type=file]')];
  const state = paymentForms.get(form);
  const scan = form.querySelector('[data-scan-proof]');
  const feedback = form.querySelector('[data-scan-feedback]');
  const review = form.querySelector('[data-scan-review]');
  const resetScan = () => {
   state.scanned = null;
   review.hidden = true;
   review.querySelector('pre').textContent = '';
   feedback.textContent = '';
  };
  mode.addEventListener('change', () => {
   form.querySelector('[data-payment-files]').hidden = !mode.value;
   scan.hidden = !['digital', 'both'].includes(mode.value);
   resetScan();
  });
  for (const input of inputs) input.addEventListener('change', () => {
   for (const other of inputs) if (other !== input) other.value = '';
   state.file = input.files[0];
   resetScan();
  });
  scan.addEventListener('click', async () => {
   if (!state.file) { feedback.textContent = 'Escolha um arquivo ou tire uma foto.'; return; }
   const controls = [form.querySelector('.foot button:not([data-act])'), mode, scan, ...inputs].filter(Boolean);
   for (const control of controls) control.disabled = true;
   try {
    const type = await proofFileType(state.file, 20 * 1024 * 1024);
    const text = await scanProof(state.file, type, message => { feedback.textContent = message; });
    if (!form.isConnected) return;
    const result = extractPayment(text);
    if (result.amount !== null) form.elements.valor.value = result.amount;
    if (result.day) form.elements.data.value = result.day;
    if (result.method) form.elements.forma.value = result.method;
    if (result.reference) ref.value = result.reference;
    state.scanned = state.file;
    review.querySelector('pre').textContent = text || 'Nenhum texto legível identificado.';
    review.hidden = false;
    feedback.textContent = 'Confira e corrija o valor, a data, a forma de pagamento e a referência antes de confirmar.';
   } catch (error) {
    feedback.textContent = error.message || 'Não foi possível escanear. Tente outra imagem ou anexe o original.';
   } finally {
    for (const control of controls) control.disabled = false;
   }
  });
 }

 async function proofFileType(file, limit) {
  if (!file || !file.size || file.size > limit) throw Error('Escolha um comprovante de até ' + Math.round(limit / 1048576) + ' MB.');
  const h = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (String.fromCharCode(...h.slice(0, 5)) === '%PDF-') return 'application/pdf';
  if (h[0] === 255 && h[1] === 216 && h[2] === 255) return 'image/jpeg';
  if (h.join(',') === '137,80,78,71,13,10,26,10') return 'image/png';
  throw Error('Selecione um JPEG, PNG ou PDF válido. Se a câmera salvar em HEIC, exporte a foto como JPEG.');
 }

 function loadOcr() {
  if (!ocrLibrary) ocrLibrary = new Promise((resolve, reject) => {
   const script = document.createElement('script');
   script.src = ocrPackage + 'tesseract.min.js';
   script.integrity = 'sha384-5D+9rOA7QhIVVlbglgjfeZ3vcuDz3a+TTrJbV3qiZqHpkTOTowdlTqQXF8E8pw/j';
   script.crossOrigin = 'anonymous';
   script.onload = () => resolve(window.Tesseract);
   script.onerror = () => { script.remove(); reject(Error('O leitor OCR não carregou. Confira a conexão e tente novamente.')); };
   document.head.append(script);
  }).catch(error => { ocrLibrary = null; throw error; });
  return ocrLibrary;
 }

 async function scanProof(file, type, feedback) {
  let worker, pdfTask;
  try {
   feedback('Preparando o leitor…');
   const recognize = async image => {
    if (!worker) {
     const tesseract = await loadOcr();
     worker = await tesseract.createWorker('por', 1, {
      workerPath: ocrPackage + 'worker.min.js',
      corePath: cdn + 'tesseract.js-core@5.1.1',
      langPath: cdn + '@tesseract.js-data/por@1.0.0/4.0.0_best_int',
      logger: step => { if (step.status === 'recognizing text') feedback('Lendo comprovante… ' + Math.round(step.progress * 100) + '%'); }
     });
    }
    return (await worker.recognize(image)).data.text;
   };
   if (type !== 'application/pdf') {
    const image = await createImageBitmap(file);
    try {
     const scale = Math.min(1, 2400 / Math.max(image.width, image.height));
     const canvas = document.createElement('canvas');
     canvas.width = Math.max(1, Math.round(image.width * scale));
     canvas.height = Math.max(1, Math.round(image.height * scale));
     const context = canvas.getContext('2d');
     context.fillStyle = 'white';
     context.fillRect(0, 0, canvas.width, canvas.height);
     context.drawImage(image, 0, 0, canvas.width, canvas.height);
     return await recognize(canvas);
    } finally { image.close(); }
   }
   const engine = await getPdfEngine();
   pdfTask = engine.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, useSystemFonts: true });
   const pdf = await pdfTask.promise;
   if (pdf.numPages > 10) throw Error('Para escanear, selecione um PDF de até 10 páginas.');
   const pages = [];
   for (let number = 1; number <= pdf.numPages; number++) {
    feedback('Lendo página ' + number + ' de ' + pdf.numPages + '…');
    const page = await pdf.getPage(number);
    const content = await page.getTextContent();
    const text = content.items.map(item => (item.str || '') + (item.hasEOL ? '\n' : ' ')).join('').trim();
    if (/\d{1,3}(?:\.\d{3})*,\d{2}\b/.test(text)) {
     pages.push(text);
    } else {
     const base = page.getViewport({ scale: 1 });
     const viewport = page.getViewport({ scale: 2000 / Math.max(base.width, base.height) });
     const canvas = document.createElement('canvas');
     canvas.width = Math.ceil(viewport.width);
     canvas.height = Math.ceil(viewport.height);
     await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
     pages.push(await recognize(canvas));
    }
    page.cleanup();
   }
   return pages.join('\n');
  } finally {
   if (worker) await worker.terminate();
   if (pdfTask) await pdfTask.destroy();
  }
 }

 function extractPayment(text) {
  const currency = /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})\b/;
  const lines = text.split(/\r?\n/);
  const valueLine = lines.findIndex(line => /\bvalor(?:\s+(?:pago|total|da transa[çc][ãa]o|do pagamento))?\b/i.test(line) && !/\b(taxa|tarifa|desconto)\b/i.test(line));
  const prioritized = valueLine < 0 ? '' : lines.slice(valueLine, valueLine + 2).join('\n');
  const match = currency.exec(prioritized) || new RegExp('R\\$\\s*' + currency.source.replace('(?:R\\$\\s*)?', ''), 'i').exec(text);
  const amount = match ? Number(match[1].replace(/\./g, '').replace(',', '.')) : null;
  const dmy = /\b(\d{2})[/. -](\d{2})[/. -](20\d{2})\b/.exec(text);
  const iso = /\b20\d{2}-\d{2}-\d{2}\b/.exec(text);
  let day = dmy ? dmy[3] + '-' + dmy[2] + '-' + dmy[1] : iso?.[0];
  if (day) {
   const dateValue = new Date(day + 'T00:00:00Z');
   if (!Number.isFinite(+dateValue) || dateValue.toISOString().slice(0, 10) !== day) day = '';
  }
  const method = /\bpix\b/i.test(text) ? 'Pix' : /\b(cart[aã]o|cr[eé]dito|d[eé]bito)\b/i.test(text) ? 'Cartão' : /\bdinheiro\b/i.test(text) ? 'Dinheiro' : /\b(ted|transfer[eê]ncia)\b/i.test(text) ? 'Transferência' : '';
  const reference = /\bE[A-Z0-9]{31}\b/i.exec(text)?.[0] || '';
  return { amount, day, method, reference };
 }

 document.addEventListener('submit', async event => {
  const form = event.target;
  const state = paymentForms.get(form);
  if (!state) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (state.busy) return;
  if (!myProfile || myProfile.status !== 'ativo' || isDriver()) return;
  const table = form.dataset.receiptPayment;
  const controls = [...form.querySelectorAll('button')];
  const feedback = form.querySelector('[data-scan-feedback]');
  state.busy = true;
  for (const control of controls) control.disabled = true;
  try {
   const cash = form.elements.forma.value === 'Dinheiro';
   const mode = form.querySelector('#payment-proof-mode').value;
   const editing = Boolean(state.recordId);
   const old = get(table, state.recordId);
   const value = Number(form.elements.valor.value);
   const day = form.elements.data.value;
   const reference = form.querySelector('#payment-reference').value.trim();
   const parentField = table === 'pagamentos' ? 'viagem_id' : 'pendencia_id';
   const parent = table === 'pagamentos' ? form.elements.viagem_id.value : state.parentId;
   if (!Number.isFinite(value) || value <= 0 || !day || !parent) throw Error('Confira a origem, a data e o valor do pagamento.');
   if (state.unconfirmed) {
    const { data, error } = await api.from('frota_records').select('id,version').eq('kind', table).eq('id', state.id).maybeSingle();
    if (error) throw error;
    if (data && data.version > state.expected) {
     await finishPayment(form, 'O pagamento já foi registrado.');
     return;
    }
    state.unconfirmed = false;
   }
   const file = state.file;
   const preserve = mode === 'original' || mode === 'both';
   const digital = mode === 'digital' || mode === 'both';
   if (digital && (!file || state.scanned !== file)) throw Error('Escaneie o comprovante e confira os dados antes de confirmar.');
   if (preserve && old.recibo && old.arquivo) throw Error('O comprovante original deste recibo já está salvo e será preservado.');
   const proof = {};
   if (mode) {
    const type = await proofFileType(file, preserve ? 2 * 1024 * 1024 : 20 * 1024 * 1024);
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    proof.comprovante_sha256 = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    if (old.comprovante_sha256 && old.comprovante_sha256 !== proof.comprovante_sha256) throw Error('Já existe um comprovante associado a este pagamento.');
    if (preserve) {
     if (state.upload?.file !== file) {
      const uploaded = {};
      await uploadFile(await blobUrl(new Blob([file], { type })), uploaded, 'arquivo');
      state.upload = { file, path: uploaded.arquivo_path };
     }
     proof.arquivo_path = state.upload.path;
     proof.arquivo_nome = file.name;
    }
   }
   const data = { ...cleanRecord(old), ...auditStamp(old), ...proof, id: state.id, [parentField]: parent,
    valor: value, data: day, forma: form.elements.forma.value, referencia_pagamento: reference, recibo_digital: digital || cash };
   state.expected = editing ? recordVersions.get(table + ':' + state.id) : 0;
   const changes = [{ kind: table, id: state.id, op: 'upsert', version: state.expected, data }];
   if (table === 'pagamentos') {
    const trip = get('viagens', parent);
    if (trip.comprovante_status === 'Pendente') {
     changes.push({ kind: 'viagens', id: parent, op: 'upsert', version: recordVersions.get('viagens:' + parent),
      data: { ...cleanRecord(trip), comprovante_status: 'Conferido', comprovante_conferido_em: new Date().toISOString() } });
    }
   }
   state.unconfirmed = true;
   const { error } = await api.rpc('frota_commit', { changes });
   if (error) {
    if (error.code && error.code !== 'PGRST000') state.unconfirmed = false;
    throw error;
   }
   await finishPayment(form, 'Pagamento registrado.');
  } catch (error) {
   feedback.textContent = friendly(error);
  } finally {
   state.busy = false;
   for (const control of controls) control.disabled = false;
  }
 }, true);

 async function finishPayment(form, message) {
  form.closest('.overlay')?.remove();
  try { await loadOnline(true); } catch { /* The transaction already succeeded. */ }
  notify(message);
 }

 function receiptPdf(r) {
  const western = value => Array.from(String(value ?? '').replaceAll('→', '>').normalize('NFC'), c => {
   const code = c.charCodeAt(0);
   return code > 255 || code < 32 ? '3f' : code.toString(16).padStart(2, '0');
  }).join('');
  const rows = [
   [19, r.empresa], [16, 'Recibo de pagamento'], [10, r.numero], [11, 'Pagamento em ' + date(r.data)],
   [11, 'Emitido em ' + new Date(r.emitido_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })],
   [11, 'Motorista: ' + (r.motorista || '—')], [11, 'Origem: ' + (r.descricao || r.origem_id || '—')],
   [11, 'Valor de origem: ' + money(r.valor_total)], [14, 'Valor recebido: ' + money(r.valor)],
   [11, 'Forma de pagamento: ' + (r.forma || '—')], [11, r.referencia ? 'Referência: ' + r.referencia : '']
  ];
  const lines = rows.flatMap(([size, value]) => (String(value || '').match(/.{1,73}(?:\s|$)|.{1,73}/gu) || []).map(line => [size, line.trim()]));
  const pages = [];
  for (let begin = 0; begin < lines.length; begin += 29) pages.push(lines.slice(begin, begin + 29));
  const objects = [
   '<< /Type /Catalog /Pages 2 0 R >>',
   '<< /Type /Pages /Count ' + pages.length + ' /Kids [' + pages.map((_, i) => (4 + 2*i) + ' 0 R').join(' ') + '] >>',
   '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
  ];
  for (const [i, page] of pages.entries()) {
   const stream = '0.9 0.67 0.05 rg 46 794 503 4 re f\n0 0 0 rg\n' + page.map(([size, line], row) => 'BT /F1 ' + size + ' Tf 46 ' + (761 - row * 24) + ' Td <' + western(line) + '> Tj ET').join('\n') + '\n';
   objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ' + (5 + 2*i) + ' 0 R >>');
   objects.push('<< /Length ' + stream.length + ' >>\nstream\n' + stream + 'endstream');
  }
  let pdf = '%PDF-1.4\n';
  const offsets = ['0000000000 65535 f \n'];
  for (const [i, object] of objects.entries()) {
   offsets.push(String(pdf.length).padStart(10, '0') + ' 00000 n \n');
   pdf += (i + 1) + ' 0 obj\n' + object + '\nendobj\n';
  }
  const start = pdf.length;
  pdf += 'xref\n0 ' + offsets.length + '\n' + offsets.join('') + 'trailer\n<< /Size ' + offsets.length + ' /Root 1 0 R >>\nstartxref\n' + start + '\n%%EOF\n';
  return new Blob([pdf], { type: 'application/pdf' });
 }

 async function displayReceipt(title, file) {
  closeProof();
  const viewer = document.createElement('div');
  viewer.id = 'proof-viewer';
  viewer.className = 'overlay frota-receipt-overlay';
  proofObjectUrl = URL.createObjectURL(file);
  viewer.innerHTML = '<div class="modal frota-receipt-viewer" role="dialog" aria-modal="true" aria-label="Visualizar recibo"><div class="head"><h2>' + esc(title) + '</h2><button type="button" class="mini" data-receipt-close>Fechar</button></div>'
   + '<div class="frota-receipt-scroll"><div data-receipt-zoom>' + (file.type === 'application/pdf' ? '<div data-pdf-pages aria-live="polite">Carregando PDF…</div>' : '<img src="' + proofObjectUrl + '" alt="' + esc(title) + '">') + '</div></div>'
   + '<div class="foot"><button type="button" class="mini" aria-label="Diminuir" data-zoom-out>−</button><button type="button" class="mini" aria-label="Ampliar" data-zoom-in>+</button><a class="mini" download="' + esc(file.name) + '" href="' + proofObjectUrl + '">Baixar</a><button type="button" class="mini" data-share>Compartilhar</button></div></div>';
  const zoomArea = viewer.querySelector('[data-receipt-zoom]');
  let zoom = 1;
  const scale = amount => { zoom = Math.max(1, Math.min(3, zoom + amount)); zoomArea.style.width = (zoom * 100) + '%'; };
  viewer.querySelector('[data-zoom-out]').onclick = () => scale(-.25);
  viewer.querySelector('[data-zoom-in]').onclick = () => scale(.25);
  viewer.querySelector('[data-share]').onclick = async () => {
   try {
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] });
    else {
     viewer.querySelector('[download]').click();
     notify('Arquivo baixado para compartilhar pelo aplicativo de sua preferência.');
    }
   } catch (error) { if (error.name !== 'AbortError') notify(friendly(error), true); }
  };
  attachReceiptViewer(viewer);
  if (file.type === 'application/pdf') {
   const bytes = await file.arrayBuffer();
   if (viewer.isConnected) await renderProofPdf(new Uint8Array(bytes), viewer);
  }
 }

 function attachReceiptViewer(viewer) {
  const opener = document.activeElement;
  const close = () => { closeProof(); if (opener?.isConnected) opener.focus(); };
  viewer.querySelector('[data-receipt-close]').onclick = close;
  viewer.addEventListener('click', event => { if (event.target === viewer) close(); });
  viewer.addEventListener('keydown', event => {
   if (event.key !== 'Escape') return;
   event.stopPropagation();
   close();
  });
  document.body.append(viewer);
  viewer.querySelector('[data-receipt-close]').focus();
 }

 document.addEventListener('click', async event => {
  const button = event.target.closest('[data-frota-receipt]');
  if (!button) return;
  const kind = button.dataset.frotaReceipt;
  const recordId = button.dataset.id;
  try {
   if (kind === 'trip') {
    const trip = get('viagens', recordId);
    if (!trip.id || (isDriver() && trip.motorista_id !== myProfile.motorista_id)) return;
    const docs = receiptDocuments(trip);
    if (docs.length === 1) return await openReceipt(docs[0][0], docs[0][1]);
    closeProof();
    const viewer = document.createElement('div');
    viewer.id = 'proof-viewer';
    viewer.className = 'overlay frota-receipt-overlay';
    viewer.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-label="Recibos e comprovantes"><div class="head"><h2>Recibos e comprovantes</h2><button type="button" class="mini" data-receipt-close>Fechar</button></div><div class="frota-receipt-list">' + docs.map(doc => receiptButton(...doc)).join('') + '</div></div>';
    attachReceiptViewer(viewer);
   } else await openReceipt(kind, recordId);
  } catch (error) { notify(friendly(error), true); }
 });

 async function openReceipt(kind, recordId) {
  const digital = kind === 'digital' || kind === 'baixa-digital';
  const table = kind === 'digital' ? 'pagamentos' : kind === 'baixa-digital' ? 'baixas' : kind;
  const row = get(table, recordId);
  if (digital) {
   if (!row.recibo) throw Error('Recibo indisponível.');
   const name = row.recibo.numero + '.pdf';
   return displayReceipt('Recibo ' + row.recibo.numero, new File([receiptPdf(row.recibo)], name, { type: 'application/pdf' }));
  }
  if (!row.arquivo) throw Error('Comprovante indisponível.');
  let blob;
  if (row.arquivo_path) {
   const { data, error } = await api.storage.from('frota-documentos').download(row.arquivo_path);
   if (error) throw error;
   blob = data;
  } else blob = await (await fetch(row.arquivo)).blob();
  const type = await proofFileType(blob, 2 * 1024 * 1024).catch(() => blob.type);
  const fallback = type === 'application/pdf' ? 'comprovante.pdf' : 'comprovante';
  if (type !== 'application/pdf' && !['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'].includes(type)) throw Error('Formato do comprovante indisponível.');
  const file = new File([blob], row.arquivo_nome || fallback, { type });
  return displayReceipt(file.name, file);
 }
})();
