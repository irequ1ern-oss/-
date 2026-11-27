// Build an allowlist from the real account dependency graph. Only immutable code and the generic shell can be cached.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
export function buildAccountWorker(outDir) {
  const manifest = JSON.parse(
    readFileSync(resolve(outDir, '.vite/manifest.json'), 'utf8'),
  );
  const files = new Set(['/account/']),
    seen = new Set();
  function visit(key) {
    if (seen.has(key)) return;
    seen.add(key);
    const item = manifest[key];
    if (!item) return;
    [item.file, ...(item.css ?? []), ...(item.assets ?? [])].forEach((f) =>
      files.add('/' + f),
    );
    [...(item.imports ?? []), ...(item.dynamicImports ?? [])].forEach(visit);
  }
  visit('account/index.html');
  const version = createHash('sha256')
    .update(
      [...files].join('|') +
        readFileSync(resolve(outDir, 'account/index.html')),
    )
    .digest('hex')
    .slice(0, 16);
  const code = `
const FILES=${JSON.stringify([...files])};
const NAME='rq-account-shell-${version}';
self.addEventListener('install',e=>e.waitUntil(caches.open(NAME).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('rq-account-shell-')&&k!==NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url);
 if(e.request.method!=='GET'||u.origin!==self.location.origin||!FILES.includes(u.pathname))return;
 e.respondWith(caches.open(NAME).then(async c=>(await c.match(u.pathname))||fetch(e.request)));
});
self.addEventListener('push',e=>{
 let title='Уведомление Requiem';let id='oracle';try{const data=e.data.json();title=data.title;id=String(data.id);}catch{}
 e.waitUntil(self.registration.showNotification(title,{tag:id,body:'Открыть Oracle'}));
});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(self.clients.openWindow('/account/#oracle'));});
`;
  writeFileSync(resolve(outDir, 'account/worker.js'), code);
}
if (process.argv[1]?.endsWith('account-worker.mjs'))
  buildAccountWorker(resolve('dist'));
