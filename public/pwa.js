const m=document.createElement('link');m.rel='manifest';m.href='/manifest.webmanifest';document.head.append(m);if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
