PRAGMA foreign_keys=ON;
CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,nickname TEXT NOT NULL,password_hash TEXT NOT NULL,salt TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL);
CREATE INDEX session_expiry ON sessions(expires_at);
CREATE TABLE player_profiles(user_id TEXT PRIMARY KEY REFERENCES users(id),xp INTEGER NOT NULL DEFAULT 0,coins INTEGER NOT NULL DEFAULT 0,equipped_skin TEXT NOT NULL DEFAULT 'uniform');
CREATE TABLE player_progress(user_id TEXT PRIMARY KEY REFERENCES users(id),prologue_cleared INTEGER NOT NULL DEFAULT 0);
CREATE TABLE stage_records(run_id TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),duration INTEGER NOT NULL,PRIMARY KEY(run_id,user_id));
CREATE TABLE player_inventory(user_id TEXT NOT NULL REFERENCES users(id),skin_id TEXT NOT NULL,PRIMARY KEY(user_id,skin_id));
CREATE TABLE skins(id TEXT PRIMARY KEY,name TEXT NOT NULL,color TEXT NOT NULL);
CREATE TABLE shop_items(skin_id TEXT PRIMARY KEY REFERENCES skins(id),price INTEGER NOT NULL CHECK(price>=0));
CREATE TABLE achievements(user_id TEXT NOT NULL REFERENCES users(id),achievement_id TEXT NOT NULL,PRIMARY KEY(user_id,achievement_id));
CREATE TABLE auth_limits(key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE user_rooms(user_id TEXT PRIMARY KEY REFERENCES users(id),room_id TEXT NOT NULL,expires_at INTEGER NOT NULL);
INSERT INTO skins VALUES('uniform','기본 교복','#69c6bd'),('survivor','생존자 복장','#d9a75b'),('explorer','탐험가 복장','#8fab6b'),('rescue','특수 구조대 복장','#d48074');
CREATE TRIGGER award_clear AFTER INSERT ON stage_records BEGIN
 UPDATE player_profiles SET xp=xp+100,coins=coins+50 WHERE user_id=NEW.user_id;
 UPDATE player_progress SET prologue_cleared=1 WHERE user_id=NEW.user_id;
END;
