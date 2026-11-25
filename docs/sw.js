// Versão publicada; consultada sem cache por aplicativos instalados.
const APP_VERSION='20261125-detalhes-veiculo-20';
// Frota Martins: atualizações sempre pela rede; nunca guardar HTML/JS/CSS antigos.
// Supabase, sessão e dados continuam sob as regras normais da aplicação.
const CACHE='frota-martins-shell-20261125-detalhes-veiculo-20';
self.addEventListener('install',event=>{event.waitUntil(Promise.resolve());self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{for(const key of await caches.keys()){if(key.startsWith('frota-martins-shell-'))await caches.delete(key)}await self.clients.claim()})())});
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin)return;
 // Navegação e arquivos do app nunca são servidos do cache do PWA.
 if(req.mode==='navigate'||/\.(?:html|js|css)$/i.test(new URL(req.url).pathname)){
  event.respondWith(fetch(req,{cache:'no-store'}).catch(()=>fetch(req)));
 }
});
