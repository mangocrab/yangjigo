# 실행과 배포

## 로컬 개발

README의 `npm ci`, `npm run db:migrate`, `npm run dev` 순서로 실행한다. Node 22.12 이상, npm, SQLite 테스트용 Python 3, E2E용 Chromium이 필요하다. `.wrangler/state`의 로컬 D1/DO 데이터는 코드와 별도이며 임의로 삭제하지 않는다. 환경 준비는 `bash scripts/setup.sh`로 반복 실행할 수 있다.

읽기 전용 홈이 있는 클라우드 환경에서는 npm 캐시와 Wrangler 설정을 `/tmp`로 옮긴다. TLS·패키지 무결성 검증을 끄지 않는다. 개발에는 Cloudflare 인증이 필요 없다. 실행 프로세스는 환경 재시작 후 다시 시작해야 한다.

## Cloudflare 원격 배포 절차 (아직 실행하지 않음)

1. 계정에서 Workers·SQLite Durable Objects·D1의 지원 요금제와 실제 한도, 예상 비용을 확인한다. 사용자 승인 없이 유료 리소스를 활성화하지 않는다.
2. 승인된 계정으로 Wrangler 인증을 준비한다. 토큰·비밀값을 채팅, 소스 또는 로그에 쓰지 않는다.
3. `npx wrangler d1 create sejong-db`로 실제 D1을 생성하고 출력된 ID를 `wrangler.jsonc`의 더미 UUID 대신 설정한다. 기존 DB가 있다면 새로 만들지 말고 해당 ID를 사용한다.
4. 기존 운영 DB는 먼저 `npx wrangler d1 export sejong-db --remote --output /tmp/sejong-before-migration.sql`로 백업해 별도 안전한 저장소에 보존한다. 원격 명령은 실제 계정 데이터에 작용한다.
5. `npx wrangler d1 migrations apply sejong-db --remote`로 0001~0003을 적용한다. 기존 기록을 삭제해 마이그레이션을 우회하지 않는다.
6. `npm run build`, `npm test`, `npm run test:e2e`를 확인하고, 승인된 배포에서 `npm run deploy`를 실행한다. `GameRoom`·`Lobby`의 SQLite DO 바인딩과 v1 DO migration, D1 `DB`, Assets `ASSETS` 설정이 필요하다.
7. 공개 HTTPS에서 회원가입·로그인 쿠키·실제 PC/스마트폰 4인 완주·재접속·티켓 원자 차감·상점 거래를 다시 검증한다. Workers 요청/CPU, DO 실행 시간/메시지, D1 읽기·쓰기 사용량을 관찰한다.

한 활성 방은 35ms 계산 주기를 사용하므로 분당 약 1,714회 계산한다. 참가자 4명이 변화 스냅샷을 각각 받는다. 이 숫자는 무료 운영 가능성을 입증하지 않는다. 실제 방송 빈도·메시지 크기·활성 방 시간·D1 연산과 계정별 요금제를 측정해야 한다. 현재는 부하 테스트나 비용 산출을 완료하지 않았다.

## 소스와 데이터 보존

환경 설정 저장과 Git 소스 보존은 별개다. GitHub의 현재 원격에 코드가 없으면 설치 스크립트만으로 게임을 복원할 수 없다. 이번 작업의 소스 압축 파일은 의존성·빌드 산출물·쿠키·계정 DB를 제외한다. 소스는 내려받아 보관하고, 지속 개발 시 검토 후 GitHub에 게시해야 한다. 로컬 커밋이나 환경 스냅샷만으로 다음 작업의 복원을 보장하지 않는다.

계정 데이터는 별도 백업이 필요하다. 로컬 서버를 정상 종료한 뒤 `.wrangler` 전체를 접근 통제된 저장소에 보존할 수 있으나 이 파일에는 계정·세션이 포함되므로 소스 저장소에 넣지 않는다. 원격 D1은 위 export 절차로 관리한다. 소스만 복원하면 이전 계정은 돌아오지 않는다.
