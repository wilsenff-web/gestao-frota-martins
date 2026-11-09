// Paginação apenas de apresentação. Nunca altera os registros ou a escala dos gráficos.
const metricPageState=new Map();
function metricPageRange(total,page,size=3){const pages=Math.max(1,Math.ceil(total/size)),index=Math.max(0,Math.min(Number(page)||0,pages-1));return {page:index,pages,start:index*size,end:Math.min(total,(index+1)*size)};}
function shortMetricValue(text){const numeric=String(text).replace(/R\$|km/gi,'').replace(/\s/g,'').replace(/\./g,'').replace(',','.');const n=Number(numeric);if(!Number.isFinite(n))return text;return n>=1000000?(n/1000000).toLocaleString('pt-BR',{maximumFractionDigits:1})+' mi':n>=1000?(n/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})+' mil':n.toLocaleString('pt-BR',{maximumFractionDigits:2});}
function setupMetricPaging(){
 document.querySelectorAll('#main .metric-scroll').forEach((scroll,i)=>{
  const chart=scroll.querySelector('.metric-chart');if(!chart)return;
  const key=(chart.dataset.metricKey||String(i))+':'+year+':'+filterMonth;chart.dataset.pageKey=key;
  chart.querySelectorAll('.metric-bar>span').forEach(label=>{if(label.querySelector('.metric-label-full'))return;const full=label.textContent;label.textContent='';const a=document.createElement('span'),b=document.createElement('span');a.className='metric-label-full';a.textContent=full;b.className='metric-label-short';b.textContent=shortMetricValue(full);label.append(a,b);});
  chart.querySelectorAll('.metric-caption>strong').forEach(label=>{if(!label.textContent.includes(' · '))return;const [model,...plate]=label.textContent.split(' · ');label.textContent='';const a=document.createElement('span'),b=document.createElement('span');a.className='metric-name-main';a.textContent=model;b.className='metric-name-sub';b.textContent=plate.join(' · ');label.append(a,b);});
  const nav=document.createElement('nav');nav.className='metric-pagination';nav.setAttribute('aria-label','Navegação do gráfico '+(chart.dataset.metricKey||i));
  nav.innerHTML='<button type="button" class="mini" data-chart-step="-1" aria-label="Mostrar anteriores">‹ Anteriores</button><span class="metric-page-label" role="status" aria-live="polite"></span><button type="button" class="mini" data-chart-step="1" aria-label="Mostrar próximos">Próximos ›</button>';
  scroll.append(nav);updateMetricPage(scroll);
 });
}
function updateMetricPage(scroll,step=0){
 const chart=scroll.querySelector('.metric-chart'),groups=[...chart.querySelectorAll('.metric-group')],nav=scroll.querySelector('.metric-pagination'),mobile=window.matchMedia('(max-width:700px)').matches;
 const range=metricPageRange(groups.length,(metricPageState.get(chart.dataset.pageKey)||0)+step);metricPageState.set(chart.dataset.pageKey,range.page);
 groups.forEach((group,i)=>{group.hidden=mobile&&(i<range.start||i>=range.end);});chart.style.setProperty('--metric-visible',Math.max(1,range.end-range.start));
 nav.hidden=!mobile||groups.length<=3;nav.querySelector('[data-chart-step="-1"]').disabled=range.page===0;nav.querySelector('[data-chart-step="1"]').disabled=range.page===range.pages-1;nav.querySelector('.metric-page-label').textContent=(groups.length?range.start+1:0)+'–'+range.end+' de '+groups.length;
}
document.addEventListener('click',e=>{const button=e.target.closest('[data-chart-step]');if(!button)return;updateMetricPage(button.closest('.metric-scroll'),Number(button.dataset.chartStep));});
window.addEventListener('resize',()=>document.querySelectorAll('#main .metric-scroll').forEach(scroll=>{if(scroll.querySelector('.metric-pagination'))updateMetricPage(scroll);}));
