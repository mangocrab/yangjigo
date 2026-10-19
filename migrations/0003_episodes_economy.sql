-- 에피소드·난이도·티켓·상점. 기존 진행도와 재화는 보존한다.
CREATE TABLE episodes (
 id INTEGER PRIMARY KEY, title TEXT NOT NULL, available INTEGER NOT NULL DEFAULT 0 CHECK(available IN(0,1))
);
INSERT INTO episodes VALUES (0,'탈출 불가능한 학교',1),(1,'버려진 도시',0),(2,'침묵하는 행정도시',0),(3,'금강의 마지막 길',0),(4,'봉쇄선 너머',0);
ALTER TABLE stage_records ADD COLUMN episode_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stage_records ADD COLUMN difficulty TEXT NOT NULL DEFAULT 'legacy' CHECK(difficulty IN('legacy','easy','normal','hard'));
CREATE TABLE episode_progress (
 user_id TEXT NOT NULL REFERENCES users(id), episode_id INTEGER NOT NULL REFERENCES episodes(id),
 easy_clears INTEGER NOT NULL DEFAULT 0, normal_clears INTEGER NOT NULL DEFAULT 0, hard_clears INTEGER NOT NULL DEFAULT 0,
 best_seconds INTEGER NOT NULL, PRIMARY KEY(user_id,episode_id)
);
CREATE TABLE episode_tickets (
 user_id TEXT NOT NULL REFERENCES users(id), episode_id INTEGER NOT NULL REFERENCES episodes(id),
 quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity>=0), PRIMARY KEY(user_id,episode_id)
);
CREATE TABLE hard_entries (
 entry_id TEXT PRIMARY KEY, episode_id INTEGER NOT NULL REFERENCES episodes(id),
 participants TEXT NOT NULL CHECK(json_valid(participants)), created_at INTEGER NOT NULL
);
CREATE TRIGGER validate_hard_entry BEFORE INSERT ON hard_entries
WHEN NOT EXISTS(SELECT 1 FROM hard_entries WHERE entry_id=NEW.entry_id) BEGIN
 SELECT RAISE(ABORT,'INVALID_PARTY') WHERE json_type(NEW.participants)!='array'
 OR json_array_length(NEW.participants)<1 OR json_array_length(NEW.participants)>4
 OR (SELECT COUNT(DISTINCT value) FROM json_each(NEW.participants))!=json_array_length(NEW.participants);
 SELECT RAISE(ABORT,'HARD_TICKET_REQUIRED') WHERE EXISTS(
  SELECT 1 FROM json_each(NEW.participants) p LEFT JOIN episode_tickets t
  ON t.user_id=p.value AND t.episode_id=NEW.episode_id WHERE COALESCE(t.quantity,0)<1
 );
END;
CREATE TRIGGER consume_hard_entry AFTER INSERT ON hard_entries BEGIN
 UPDATE episode_tickets SET quantity=quantity-1
 WHERE episode_id=NEW.episode_id AND user_id IN(SELECT value FROM json_each(NEW.participants));
END;
INSERT INTO shop_items VALUES('survivor',75),('explorer',150),('rescue',300);
CREATE TABLE purchase_receipts (
 user_id TEXT NOT NULL REFERENCES users(id), request_id TEXT NOT NULL,
 skin_id TEXT NOT NULL REFERENCES skins(id), price INTEGER NOT NULL CHECK(price>=0),
 created_at INTEGER NOT NULL, PRIMARY KEY(user_id,request_id)
);
CREATE TRIGGER validate_skin_purchase BEFORE INSERT ON purchase_receipts
WHEN NOT EXISTS(SELECT 1 FROM purchase_receipts WHERE user_id=NEW.user_id AND request_id=NEW.request_id) BEGIN
 SELECT RAISE(ABORT,'INVALID_SHOP_ITEM') WHERE NOT EXISTS(SELECT 1 FROM shop_items WHERE skin_id=NEW.skin_id AND price=NEW.price);
 SELECT RAISE(ABORT,'ALREADY_OWNED') WHERE EXISTS(SELECT 1 FROM player_inventory WHERE user_id=NEW.user_id AND skin_id=NEW.skin_id);
 SELECT RAISE(ABORT,'INSUFFICIENT_COINS') WHERE COALESCE((SELECT coins FROM player_profiles WHERE user_id=NEW.user_id),-1)<NEW.price;
END;
CREATE TRIGGER complete_skin_purchase AFTER INSERT ON purchase_receipts BEGIN
 UPDATE player_profiles SET coins=coins-NEW.price WHERE user_id=NEW.user_id;
 INSERT INTO player_inventory(user_id,skin_id) VALUES(NEW.user_id,NEW.skin_id);
END;
DROP TRIGGER award_clear;
CREATE TRIGGER award_clear AFTER INSERT ON stage_records BEGIN
 UPDATE player_profiles SET
 xp=xp+CASE WHEN NEW.content_version<2 THEN 100 WHEN NEW.difficulty='easy' THEN 180 WHEN NEW.difficulty='hard' THEN 450 ELSE 300 END,
 coins=coins+CASE WHEN NEW.content_version<2 THEN 50 WHEN NEW.difficulty='easy' THEN 90 WHEN NEW.difficulty='hard' THEN 225 ELSE 150 END
 WHERE user_id=NEW.user_id;
 UPDATE player_progress SET prologue_cleared=1,prologue_version=MAX(prologue_version,NEW.content_version)
 WHERE user_id=NEW.user_id AND NEW.episode_id=0;
 INSERT INTO episode_progress(user_id,episode_id,easy_clears,normal_clears,hard_clears,best_seconds)
 SELECT NEW.user_id,NEW.episode_id,NEW.difficulty='easy',NEW.difficulty='normal',NEW.difficulty='hard',NEW.duration
 WHERE NEW.content_version>=2 AND NEW.difficulty IN('easy','normal','hard')
 ON CONFLICT(user_id,episode_id) DO UPDATE SET
 easy_clears=easy_clears+excluded.easy_clears,normal_clears=normal_clears+excluded.normal_clears,
 hard_clears=hard_clears+excluded.hard_clears,best_seconds=MIN(best_seconds,excluded.best_seconds);
 INSERT INTO episode_tickets(user_id,episode_id,quantity)
 SELECT NEW.user_id,NEW.episode_id,1 WHERE NEW.content_version>=2 AND NEW.difficulty='normal'
 ON CONFLICT(user_id,episode_id) DO UPDATE SET quantity=quantity+1;
 INSERT OR IGNORE INTO achievements(user_id,achievement_id)
 SELECT NEW.user_id,'episode_'||NEW.episode_id||'_clear'
 WHERE NEW.content_version>=2 AND NEW.difficulty IN('easy','normal','hard');
 INSERT OR IGNORE INTO achievements(user_id,achievement_id)
 SELECT NEW.user_id,'episode_'||NEW.episode_id||'_hard'
 WHERE NEW.content_version>=2 AND NEW.difficulty='hard';
END;
