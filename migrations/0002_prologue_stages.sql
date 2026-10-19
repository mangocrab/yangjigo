ALTER TABLE stage_records ADD COLUMN content_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE player_progress ADD COLUMN prologue_version INTEGER NOT NULL DEFAULT 1;
DROP TRIGGER award_clear;
CREATE TRIGGER award_clear AFTER INSERT ON stage_records BEGIN
 UPDATE player_profiles SET xp=xp+CASE WHEN NEW.content_version>=2 THEN 300 ELSE 100 END,coins=coins+CASE WHEN NEW.content_version>=2 THEN 150 ELSE 50 END WHERE user_id=NEW.user_id;
 UPDATE player_progress SET prologue_cleared=1,prologue_version=MAX(prologue_version,NEW.content_version) WHERE user_id=NEW.user_id;
END;
