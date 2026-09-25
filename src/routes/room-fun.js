import { randomUUID, randomInt } from "node:crypto";

const activities = new WeakMap(),
  gifts = new WeakMap();
const questions = [
  ["Türkiye'nin başkenti?", ["Ankara", "İstanbul", "İzmir"], 0],
  ["Güneş sistemindeki en büyük gezegen?", ["Mars", "Jüpiter", "Venüs"], 1],
  ["Bir saatte kaç saniye vardır?", ["60", "600", "3600"], 2],
  ["Suyun kimyasal formülü?", ["CO2", "H2O", "O2"], 1],
  ["Mersin hangi bölgededir?", ["Akdeniz", "Ege", "Marmara"], 0],
];
const words = ["sohbet", "arkadaş", "gezegen", "deniz", "yıldız", "müzik"];
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
  return {
    activity,
    gifts: (gifts.get(room) || []).filter(
      (g) => Date.now() - g.created < 15000,
    ),
  };
}
export function register({ app, rooms, presence, fail }) {
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
