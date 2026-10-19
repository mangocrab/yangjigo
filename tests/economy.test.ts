import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const migrations = [
  '0001_initial.sql',
  '0002_prologue_stages.sql',
  '0003_episodes_economy.sql',
].map((n) => readFileSync('migrations/' + n, 'utf8'));
function sqlTest(code: string) {
  const run = spawnSync(
    'python3',
    [
      '-c',
      `import sqlite3,json,sys\nsql=json.load(sys.stdin)\nc=sqlite3.connect(':memory:')\nfor s in sql:c.executescript(s)\nfor u in ['a','b','c','d']:\n c.execute('INSERT INTO users VALUES(?,?,?,?,?,?)',(u,u,u,'hash','salt',0))\n c.execute('INSERT INTO player_profiles(user_id) VALUES(?)',(u,))\n c.execute('INSERT INTO player_progress(user_id) VALUES(?)',(u,))\n c.execute('INSERT INTO player_inventory VALUES(?,?)',(u,'uniform'))\ndef clear(u,run,difficulty='normal',ep=0):\n c.execute('INSERT OR IGNORE INTO stage_records(run_id,user_id,duration,content_version,episode_id,difficulty) VALUES(?,?,60,3,?,?)',(run,u,ep,difficulty))\ndef tickets():return dict(c.execute('SELECT user_id,quantity FROM episode_tickets WHERE episode_id=0'))\ndef reject(query,args=()):\n try:c.execute(query,args)\n except sqlite3.IntegrityError:return\n raise AssertionError('거부되지 않은 요청')\n${code}\nprint('ok')`,
    ],
    { input: JSON.stringify(migrations), encoding: 'utf8' },
  );
  expect(run.stderr).toBe('');
  expect(run.status).toBe(0);
  expect(run.stdout.trim()).toBe('ok');
}
it('난이도별 보상, 노말만 해당 에피소드 티켓, 중복 보상 없음', () =>
  sqlTest(`clear('a','easy','easy')
assert tickets()=={}
clear('b','normal')
clear('b','normal')
clear('c','hard','hard')
assert tickets()=={'b':1}
assert c.execute('SELECT xp,coins FROM player_profiles WHERE user_id="a"').fetchone()==(180,90)
assert c.execute('SELECT xp,coins FROM player_profiles WHERE user_id="b"').fetchone()==(300,150)
assert c.execute('SELECT xp,coins FROM player_profiles WHERE user_id="c"').fetchone()==(450,225)
assert c.execute('SELECT normal_clears FROM episode_progress WHERE user_id="b"').fetchone()==(1,)`));
it('4인 전원 티켓 없으면 무차감, 전원 있으면 원자 차감, 재요청 무차감, 에피소드 분리', () =>
  sqlTest(`for u in ['a','b','c']:clear(u,'normal')
party=json.dumps(['a','b','c','d'])
reject('INSERT INTO hard_entries VALUES(?,?,?,?)',('entry',0,party,0))
assert tickets()=={'a':1,'b':1,'c':1}
clear('d','normal')
c.execute('INSERT OR IGNORE INTO hard_entries VALUES(?,?,?,?)',('entry',0,party,0))
c.execute('INSERT OR IGNORE INTO hard_entries VALUES(?,?,?,?)',('entry',0,party,0))
assert set(tickets().values())=={0}
reject('INSERT INTO hard_entries VALUES(?,?,?,?)',('other',0,party,0))
c.execute('INSERT INTO episode_tickets VALUES("a",1,1)')
reject('INSERT INTO hard_entries VALUES(?,?,?,?)',('wrong-episode',0,json.dumps(['a']),0))
assert c.execute('SELECT quantity FROM episode_tickets WHERE user_id="a" AND episode_id=1').fetchone()==(1,)`));
it('구매 가격·잔액·보유권·중복 요청·롤백을 검증', () =>
  sqlTest(`clear('a','normal')
reject('INSERT INTO purchase_receipts VALUES(?,?,?,?,?)',('a','bad-price','survivor',0,0))
reject('INSERT INTO purchase_receipts VALUES(?,?,?,?,?)',('a','poor','rescue',300,0))
c.execute('INSERT OR IGNORE INTO purchase_receipts VALUES(?,?,?,?,?)',('a','purchase','survivor',75,0))
c.execute('INSERT OR IGNORE INTO purchase_receipts VALUES(?,?,?,?,?)',('a','purchase','survivor',75,0))
assert c.execute('SELECT coins FROM player_profiles WHERE user_id="a"').fetchone()==(75,)
assert c.execute('SELECT COUNT(*) FROM player_inventory WHERE user_id="a" AND skin_id="survivor"').fetchone()==(1,)
reject('INSERT INTO purchase_receipts VALUES(?,?,?,?,?)',('a','again','survivor',75,0))
c.commit()
c.execute('BEGIN')
clear('a','rollback')
c.rollback()
assert tickets()['a']==1
assert c.execute('SELECT coins FROM player_profiles WHERE user_id="a"').fetchone()==(75,)`));
it('기존 스테이지 기록은 legacy로 보존하고 티켓을 소급 지급하지 않음', () => {
  const code = `import sqlite3,json,sys\nsql=json.load(sys.stdin)\nc=sqlite3.connect(':memory:')\nc.executescript(sql[0])\nc.executescript(sql[1])\nc.execute('INSERT INTO users VALUES("a","old","이전","hash","salt",0)')\nc.execute('INSERT INTO player_profiles(user_id) VALUES("a")')\nc.execute('INSERT INTO player_progress(user_id) VALUES("a")')\nc.execute('INSERT INTO stage_records VALUES("old","a",60,2)')\nc.executescript(sql[2])\nassert c.execute('SELECT xp,coins FROM player_profiles').fetchone()==(300,150)\nassert c.execute('SELECT difficulty FROM stage_records').fetchone()==('legacy',)\nassert c.execute('SELECT COUNT(*) FROM episode_tickets').fetchone()==(0,)`;
  const r = spawnSync('python3', ['-c', code], {
    input: JSON.stringify(migrations),
    encoding: 'utf8',
  });
  expect(r.stderr).toBe('');
  expect(r.status).toBe(0);
});
