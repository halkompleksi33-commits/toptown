import { randomUUID, randomInt } from "node:crypto";
import { botRoster } from "../bot-presence.js";

const activities = new WeakMap(),
  gifts = new WeakMap(),
  propertyGames = new WeakMap();
const board = ["Başlangıç", "Liman", "Çarşı", "Park", "Müze", "Sahil", "Kafe", "Sinema", "Meydan", "Kütüphane", "Marina", "Festival"];
const questions = [
  ["Türkiye'nin başkenti?", ["Ankara", "İstanbul", "İzmir"], 0],
  ["Güneş sistemindeki en büyük gezegen?", ["Mars", "Jüpiter", "Venüs"], 1],
  ["Bir saatte kaç saniye vardır?", ["60", "600", "3600"], 2],
  ["Suyun kimyasal formülü?", ["CO2", "H2O", "O2"], 1],
  ["Mersin hangi bölgededir?", ["Akdeniz", "Ege", "Marmara"], 0],
];
const words = ["sohbet", "arkadaş", "gezegen", "deniz", "yıldız", "müzik"];
function rollPropertyPlayer(game, player) {
  const roll = randomInt(1, 7);
  player.position = (player.position + roll) % board.length;
  const spot = board[player.position];
  if (player.position === 0) {
    player.cash += 100;
    game.log.push(player.name + " başlangıç bonusu aldı (+100).");
  } else if (
    !game.players.some(
      (p) => p.id !== player.id && p.properties.includes(player.position),
    ) &&
    !player.properties.includes(player.position)
  ) {
    const price = 80 + player.position * 10;
    if (player.cash >= price) {
      player.cash -= price;
      player.properties.push(player.position);
      game.log.push(player.name + " " + spot + " arsasını aldı (-" + price + ").");
    } else game.log.push(player.name + " " + spot + " alanına geldi.");
  } else {
    const owner = game.players.find(
      (p) => p.id !== player.id && p.properties.includes(player.position),
    );
    if (owner) {
      const rent = 30 + player.position * 5;
      player.cash = Math.max(0, player.cash - rent);
      owner.cash += rent;
      game.log.push(player.name + ", " + owner.name + "'a " + rent + " kira ödedi.");
    }
  }
  game.lastRoll = { name: player.name, roll, spot };
  game.turn = (game.turn + 1) % game.players.length;
}
export function giftEvent(room, sender, recipient, gift) {
  const list = gifts.get(room) || [];
  list.push({
    id: randomUUID(),
    sender: sender.name,
    recipient: recipient.name,
    gift,
    created: Date.now(),
  });
  gifts.set(room, list.slice(-20));
}
export function roomFun(room, userId) {
  const a = activities.get(room);
  let activity = null;
  if (a) {
    const ended = a.closed || Date.now() >= a.ends;
    activity = {
      id: a.id,
      type: a.type,
      title: a.title,
      options: a.options,
      ends: a.ends,
      ended,
      count: a.votes.size,
      voted: a.votes.has(userId),
      results: a.options.map(
        (_, i) => [...a.votes.values()].filter((v) => v.choice === i).length,
      ),
      answer: ended ? a.answer : undefined,
      winners: ended
        ? [...a.votes.values()].filter((v) => v.correct).map((v) => v.name)
        : [],
    };
  }
  const game = propertyGames.get(room);
  return {
    activity,
    gifts: (gifts.get(room) || []).filter(
      (g) => Date.now() - g.created < 15000,
    ),
    propertyGame: game ? {
      players: game.players.map((p) => ({ id:p.id,name:p.name,position:p.position,cash:p.cash,properties:p.properties })),
      turn: game.players[game.turn]?.id || null,
      lastRoll: game.lastRoll || null,
      log: game.log.slice(-4),
      board,
      botAvailable: !!botRoster.get(room),
    } : null,
  };
}
export function register({ app, rooms, presence, fail }) {
  app.post("/api/property-game", (q,r) => {
    const member=presence.get(q.user.id), room=rooms.get(member?.room);
    if(!room) return fail(r,409,"Önce odaya katılın.");
    if(member.muted) return fail(r,403,"Susturulan kullanıcı oyuna katılamaz.");
    const action=q.body?.action; let game=propertyGames.get(room);
    if(action==="start") {
      if(room.owner!==q.user.id && !q.user.is_admin) return fail(r,403,"Oyunu yalnızca oda sahibi veya yönetici başlatabilir.");
      game={players:[],turn:0,lastRoll:null,log:["Emlak Turu başladı. En fazla 4 kişi katılabilir."]}; propertyGames.set(room,game);
    } else if(action==="join") {
      if(!game) return fail(r,409,"Önce oda sahibi oyunu başlatmalı.");
      if(game.players.some(p=>p.id===q.user.id)) return fail(r,409,"Zaten oyundasın.");
      if(game.players.length>=4) return fail(r,409,"Oyun en fazla 4 kişiyle oynanır.");
      game.players.push({id:q.user.id,name:q.user.name,position:0,cash:800,properties:[]}); game.log.push(q.user.name+" oyuna katıldı.");
    } else if(action==="join-bot") {
      if(room.owner!==q.user.id && !q.user.is_admin) return fail(r,403,"Botu yalnızca oda sahibi veya yönetici ekleyebilir.");
      const bot=botRoster.get(room);
      if(!game) return fail(r,409,"Önce oyunu başlatın.");
      if(!bot) return fail(r,409,"Önce oda botunu etkinleştirip odaya katın.");
      if(game.players.some(p=>p.id==="bot:"+room.id)) return fail(r,409,"Bot zaten oyunda.");
      if(game.players.length>=4) return fail(r,409,"Oyun en fazla 4 kişiyle oynanır.");
      game.players.push({id:"bot:"+room.id,name:bot.name+" [BOT]",position:0,cash:800,properties:[],isBot:true}); game.log.push(bot.name+" [BOT] oyuna katıldı.");
    } else if(action==="roll") {
      if(!game || game.players.length<2) return fail(r,409,"Zar için en az 2 oyuncu gerekli.");
      const player=game.players[game.turn];
      if(player?.id!==q.user.id) return fail(r,403,"Sıra diğer oyuncuda.");
      rollPropertyPlayer(game,player);
      const bot=game.players[game.turn];
      if(bot?.isBot) { rollPropertyPlayer(game,bot); game.log.push(bot.name+" otomatik zar attı."); }
    } else return fail(r,400,"Geçersiz oyun işlemi.");
    r.json(roomFun(room,q.user.id));
  });
  app.post("/api/activity", (q, r) => {
    const member = presence.get(q.user.id),
      room = rooms.get(member?.room);
    if (!room) return fail(r, 409, "Önce odaya katılın.");
    const body = q.body || {},
      old = activities.get(room);
    if (body.action === "vote") {
      if (member.muted) return fail(r, 403, "Susturulan kullanıcı katılamaz.");
      if (!old || body.id !== old.id || old.closed || Date.now() >= old.ends)
        return fail(r, 409, "Etkinlik sona erdi.");
      if (old.votes.has(q.user.id)) return fail(r, 409, "Zaten katıldınız.");
      let choice = body.choice,
        correct = false;
      if (old.type === "word") {
        const answer = String(body.answer || "")
          .trim()
          .toLocaleLowerCase("tr-TR");
        if (!answer || answer.length > 40)
          return fail(r, 400, "Kelimeyi yazın.");
        correct = answer === old.answer;
      } else {
        if (
          !Number.isInteger(choice) ||
          choice < 0 ||
          choice >= old.options.length
        )
          return fail(r, 400, "Bir seçenek seçin.");
        correct = old.type === "quiz" && old.options[choice] === old.answer;
      }
      old.votes.set(q.user.id, { choice, correct, name: q.user.name });
    } else {
      if (room.owner !== q.user.id && !q.user.is_admin)
        return fail(r, 403, "Yalnızca oda sahibi veya yönetici başlatabilir.");
      if (body.action === "close") {
        if (!old || body.id !== old.id)
          return fail(r, 409, "Etkinlik bulunamadı.");
        old.closed = true;
      } else if (body.action === "start") {
        if (old && !old.closed && Date.now() < old.ends)
          return fail(r, 409, "Önce mevcut etkinliği bitirin.");
        const type = body.type;
        let title,
          options = [],
          answer;
        if (type === "poll") {
          title = String(body.title || "").trim();
          options = Array.isArray(body.options)
            ? body.options.map((x) => String(x).trim())
            : [];
          if (
            title.length < 3 ||
            title.length > 120 ||
            options.length < 2 ||
            options.length > 4 ||
            options.some((x) => !x || x.length > 60) ||
            new Set(options).size !== options.length
          )
            return fail(r, 400, "Soru ve 2–4 farklı seçenek girin.");
        } else if (type === "quiz") {
          const question = questions[randomInt(questions.length)];
          [title, options] = question;
          answer = options[question[2]];
        } else if (type === "word") {
          answer = words[randomInt(words.length)];
          title = "Karışık harfleri çöz: " + [...answer].reverse().join(" · ");
        } else return fail(r, 400, "Geçersiz etkinlik.");
        activities.set(room, {
          id: randomUUID(),
          type,
          title,
          options,
          answer,
          votes: new Map(),
          ends: Date.now() + 60000,
        });
      } else return fail(r, 400, "Geçersiz işlem.");
    }
    r.json(roomFun(room, q.user.id));
  });
}
