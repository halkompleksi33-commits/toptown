document.addEventListener('click',event=>{const button=event.target.closest('[data-emoji]');if(!button)return;document.querySelector('#emoji').value=button.dataset.emoji;document.querySelectorAll('[data-emoji]').forEach(item=>item.classList.toggle('selected',item===button));});
const originalHome=home;
home=async function(){
 await originalHome();
 const reward=await api('rewards'),button=$('#rewardButton');
 button.hidden=!reward.reward.available;
 button.textContent=reward.reward.available?'🎁 Günlük ödülü al'+(reward.reward.streak?' · '+reward.reward.streak+' gün seri':''):'';
};
$('#rewardButton').onclick=safe(async()=>{
 const claimed=await api('rewards/claim',{});
 toast('+'+claimed.coins+' jeton kazandın! '+claimed.streak+' gün seri.'+(claimed.badges.length?' Yeni rozet: '+claimed.badges.join(', '):''));
 $('#rewardButton').hidden=true;
 await home();
});
const social=document.createElement('section');social.className='whatsnew';social.innerHTML='<span class="eyebrow">TOPLULUK</span><div class="social-actions"><button data-social="friends">🤝 Arkadaşlarım</button><button data-social="invite">✉️ Odaya davet et</button><button data-social="report">🛡️ Kullanıcı bildir</button><button data-social="store">🛍️ Rozet mağazası</button></div><p id="socialResult" class="fine"></p>';document.querySelector('#home .whatsnew')?.after(social);
social.onclick=safe(async event=>{const action=event.target.dataset.social;if(!action)return;const output=$('#socialResult');if(action==='friends'){const friends=await api('friends');output.textContent=friends.length?friends.map(f=>f.emoji+' '+f.name+' · '+(f.status==='accepted'?'arkadaş':'istek bekliyor')).join(' | '):'Henüz arkadaşın yok. Odadaki bir kullanıcıyı bildir/davet seçenekleriyle tanıyabilirsin.';}else if(action==='invite'){if(!room)throw Error('Önce bir odaya gir.');const id=prompt('Davet edilecek kullanıcı kimliği');if(!id)return;await api('invite',{user:id,room});output.textContent='Davet gönderildi.';}else if(action==='report'){const id=prompt('Bildirilecek kullanıcı kimliği'),reason=prompt('Nedeni');if(!id||!reason)return;await api('report',{user:id,reason});output.textContent='Bildirim yönetime iletildi.';}else output.textContent='Mağaza yakında: rozetler günlük seri ve topluluk etkinlikleriyle kazanılabilir.';});
