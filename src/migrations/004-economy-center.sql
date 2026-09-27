CREATE TABLE IF NOT EXISTS economy_purchases(
  user_id TEXT NOT NULL REFERENCES users(id),
  item TEXT NOT NULL,
  created BIGINT NOT NULL,
  PRIMARY KEY(user_id,item)
);
CREATE TABLE IF NOT EXISTS economy_task_claims(
  user_id TEXT NOT NULL REFERENCES users(id),
  task TEXT NOT NULL,
  day TEXT NOT NULL,
  created BIGINT NOT NULL,
  PRIMARY KEY(user_id,task,day)
);
