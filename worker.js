const enc = new TextEncoder();
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2,'0')).join('');
const sha = async s => hex(await crypto.subtle.digest('SHA-256',enc.encode(s)));
const now = () => Math.floor(Date.now()/1000);
function fail(message,status=400){throw Object.assign(new Error(message),{status});}
function clean(v,min,max){if(typeof v!=='string'||v.trim().length<min||v.trim().length>max)fail('Alanları kontrol edin.');return v.trim();}
async function password(value,salt){const key=await crypto.subtle.importKey('raw',enc.encode(value),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode(salt),iterations:100000,hash:'SHA-256'},key,256));}
function equal(a,b){if(a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0;}
const profile = u => ({id:u.id,name:u.name,emoji:u.emoji||'🙂',city:u.city,age:u.age,coins:u.coins});
async function sweep(db){await db.prepare('DELETE FROM presence WHERE seen < ?').bind(now()-60).run();}
export default {
 async scheduled(event,env){await sweep(env.DB);await env.DB.batch([env.DB.prepare('DELETE FROM sessions WHERE expires < ?').bind(now()),env.DB.prepare('DELETE FROM rate_limits WHERE expires < ?').bind(now())]);},
 async fetch(req,env){
  const url=new URL(req.url);
  if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(req);
  const db=env.DB,q=(sql,...args)=>db.prepare(sql).bind(...args);
  try{
   const path=url.pathname.slice(5),post=req.method==='POST';
   if(!post&&req.method!=='GET')fail('Yöntem desteklenmiyor.',405);
   if(post&&req.headers.get('Origin')&&req.headers.get('Origin')!==url.origin)fail('Geçersiz kaynak.',403);
   let body={};if(post){const raw=await req.text();if(raw.length>8192)fail('İstek çok büyük.',413);try{body=JSON.parse(raw||'{}');}catch{fail('Geçersiz istek.');}}
   const limit=async(key,max,window)=>{const k=await sha(key+':'+Math.floor(now()/window));const row=await q('INSERT INTO rate_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',k,now()+window).first();if(row.count>max)fail('Çok fazla deneme. Biraz sonra tekrar deneyin.',429);};
   let result;
   if(post&&(path==='register'||path==='login')){
    await limit('auth:'+req.headers.get('CF-Connecting-IP'),12,600);
    const name=clean(body.name,2,30),login=name.normalize('NFKC').toLocaleLowerCase('tr-TR');
    if(typeof body.password!=='string'||body.password.length<4||body.password.length>128)fail('Şifre 4–128 karakter olmalı.');
    let u;
    if(path==='register'){
     const city=clean(body.city,2,50),age=Number(body.age);if(!Number.isInteger(age)||age<18||age>120)fail('Yaş 18–120 arasında olmalı.');
     if(await q('SELECT id FROM users WHERE login=?',login).first())fail('Bu isim kullanılıyor. Başka bir isim seçin.',409);
     const id=crypto.randomUUID(),salt=crypto.randomUUID(),hash=await password(body.password,salt),first=!(await q('SELECT id FROM users WHERE is_admin=1 LIMIT 1').first());
     await q('INSERT INTO users(id,name,login,city,age,salt,password_hash,coins,is_admin,created) VALUES(?,?,?,?,?,?,?,?,?,?)',id,name,login,city,age,salt,hash,1000,first?1:0,now()).run();u=await q('SELECT * FROM users WHERE id=?',id).first();
    }else{
     u=await q('SELECT * FROM users WHERE login=?',login).first();const h=await password(body.password,u?.salt||'invalid-account');if(!u||!equal(h,u.password_hash))fail('İsim veya şifre hatalı.',401);
    }
    const token=hex(crypto.getRandomValues(new Uint8Array(32)));await q('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)',await sha(token),u.id,now()+86400).run();result={token,user:profile(u)};
   }else{
    const token=(req.headers.get('Authorization')||'').replace(/^Bearer /,'');
    const u=await q('SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token=? AND sessions.expires>?',await sha(token),now()).first();if(!u)fail('Oturum sona erdi. Tekrar giriş yapın.',401);
    if(post)await limit('action:'+u.id,90,60);
    const member=async()=>{const p=await q('SELECT * FROM presence WHERE user_id=?',u.id).first();if(!p)fail('Önce bir odaya katılın.',409);return p;};
    if(path==='me'&&!post)result={user:profile(u),admin:u.is_admin===1||env.ADMIN_USER_ID===u.id};
    else if(path==='profile'&&post){const emoji=clean(body.emoji,1,16);await q('UPDATE users SET emoji=? WHERE id=?',emoji,u.id).run();result={user:{...profile(u),emoji}};}
    else if(path==='rooms'&&!post){const rows=await q('SELECT rooms.id,rooms.name,rooms.owner,COUNT(presence.user_id) AS online FROM rooms LEFT JOIN presence ON presence.room_id=rooms.id AND presence.seen>? GROUP BY rooms.id ORDER BY rooms.created DESC LIMIT 100',now()-60).all();result=rows.results;}
    else if(path==='rooms'&&post){await limit('room:'+u.id,5,3600);const id=crypto.randomUUID();await q('INSERT INTO rooms(id,name,owner,created) VALUES(?,?,?,?)',id,clean(body.name,2,50),u.id,now()).run();result={id};}
    else if(path==='join'&&post){const room=await q('SELECT id FROM rooms WHERE id=?',body.room).first();if(!room)fail('Oda bulunamadı.',404);await sweep(db);await db.batch([q('DELETE FROM presence WHERE user_id=? AND room_id<>?',u.id,room.id),q('INSERT INTO presence(user_id,room_id,seen) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET seen=excluded.seen',u.id,room.id,now())]);result={ok:true};}
    else if(path==='leave'&&post){await q('DELETE FROM presence WHERE user_id=?',u.id).run();result={ok:true};}
    else if(path==='logout'&&post){await db.batch([q('DELETE FROM presence WHERE user_id=?',u.id),q('DELETE FROM sessions WHERE token=?',await sha(token))]);result={ok:true};}
    else if(path==='state'&&!post){await sweep(db);const p=await member();await q('UPDATE presence SET seen=? WHERE user_id=?',now(),u.id).run();const room=await q('SELECT id,name,owner,youtube FROM rooms WHERE id=?',p.room_id).first();const people=await q("SELECT users.id,users.name,COALESCE(users.emoji,'🙂') AS emoji,presence.seat FROM presence JOIN users ON users.id=presence.user_id WHERE room_id=? ORDER BY users.name",p.room_id).all();const messages=await q('SELECT id,name,kind,text,created FROM messages WHERE room_id=? AND id>? ORDER BY id DESC LIMIT 100',p.room_id,Math.max(0,Number(url.searchParams.get('after'))||0)).all();result={room,people:people.results,messages:messages.results.reverse(),coins:u.coins};}
    else if(path==='signal'&&post){const p=await member();const target=await q('SELECT user_id FROM presence WHERE user_id=? AND room_id=? AND seen>?',body.to,p.room_id,now()-60).first();if(!target||target.user_id===u.id)fail('Kullanıcı odada değil.',409);if(!body.payload||typeof body.payload!=='object')fail('Geçersiz bağlantı verisi.');await q('INSERT INTO signals(id,room_id,from_user,to_user,payload,created) VALUES(?,?,?,?,?,?)',crypto.randomUUID(),p.room_id,u.id,target.user_id,JSON.stringify(body.payload),now()).run();result={ok:true};}
    else if(path==='signal'&&!post){const p=await member();const rows=(await q('SELECT id,from_user,payload FROM signals WHERE to_user=? AND room_id=? ORDER BY created,id LIMIT 50',u.id,p.room_id).all()).results;if(rows.length)await q('DELETE FROM signals WHERE to_user=? AND room_id=?',u.id,p.room_id).run();result=rows.map(r=>({from:r.from_user,payload:JSON.parse(r.payload)}));}
    else if(path==='message'&&post){const p=await member();await limit('msg:'+u.id,20,60);await q('INSERT INTO messages(room_id,user_id,name,kind,text,created) VALUES(?,?,?,?,?,?)',p.room_id,u.id,u.name,'chat',clean(body.text,1,1000),now()).run();result={ok:true};}
    else if(path==='seat'&&post){await member();const seat=body.seat;if(seat!==null&&(!Number.isInteger(seat)||seat<0||seat>8))fail('Geçersiz koltuk.');try{await q('UPDATE presence SET seat=?,seen=? WHERE user_id=?',seat,now(),u.id).run();}catch{fail('Bu koltuğa başka biri oturdu.',409);}result={ok:true};}
    else if(path==='youtube'&&post){const p=await member();const id=body.id;if(id!==null&&!/^[\w-]{11}$/.test(id||''))fail('Geçerli bir YouTube bağlantısı girin.');await db.batch([q('UPDATE rooms SET youtube=? WHERE id=?',id,p.room_id),q('INSERT INTO messages(room_id,user_id,name,kind,text,created) VALUES(?,?,?,?,?,?)',p.room_id,u.id,u.name,'system',id?'YouTube videosu başlattı':'videoyu kapattı',now())]);result={ok:true};}
    else if(path==='gift'&&post){const p=await member(),costs={rose:30,cake:120,rocket:300,crown:800},cost=costs[body.gift];if(!cost)fail('Geçersiz hediye.');if(u.coins<cost)fail('Yeterli jeton yok. Jeton satın alma henüz açık değil.');const recipient=await q('SELECT users.id,users.name FROM users JOIN presence ON presence.user_id=users.id WHERE users.id=? AND presence.room_id=?',body.recipient,p.room_id).first();if(!recipient||recipient.id===u.id)fail('Odadan başka bir kullanıcı seçin.');const id=crypto.randomUUID();await db.batch([q('INSERT INTO gifts SELECT ?,?,?,?, ?,?,? WHERE (SELECT coins FROM users WHERE id=?)>=?',id,u.id,recipient.id,p.room_id,body.gift,cost,now(),u.id,cost),q('UPDATE users SET coins=coins-? WHERE id=? AND EXISTS(SELECT 1 FROM gifts WHERE id=?)',cost,u.id,id),q('UPDATE users SET coins=coins+? WHERE id=? AND EXISTS(SELECT 1 FROM gifts WHERE id=?)',cost,recipient.id,id),q('INSERT INTO messages(room_id,user_id,name,kind,text,created) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM gifts WHERE id=?)',p.room_id,u.id,u.name,'gift',recipient.name+' için '+body.gift+' gönderdi · '+cost+' jeton aktarıldı',now(),id)]);result={ok:true};}
    else if(path==='admin'&&!post){if(!(u.is_admin===1||env.ADMIN_USER_ID===u.id))fail('Yönetici yetkisi gerekiyor.',403);const users=(await q('SELECT id,name,city,age,coins,is_admin,created FROM users ORDER BY created DESC LIMIT 500').all()).results;const rooms=(await q('SELECT COUNT(*) AS count FROM rooms').first()).count;const online=(await q('SELECT COUNT(*) AS count FROM presence WHERE seen>?',now()-60).first()).count;result={summary:{users:users.length,rooms,online},users};}
    else fail('Bulunamadı.',404);
   }
   return Response.json(result,{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }catch(e){if(!e.status)console.error('API failure',e.message);return Response.json({error:e.status?e.message:'İşlem tamamlanamadı. Tekrar deneyin.'},{status:e.status||500,headers:{'Cache-Control':'no-store'}});}
 }
};
