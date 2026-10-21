import type { Job } from './content';
export interface StoryLine {
  speaker: string;
  job: Job | null;
  text: string;
}
export interface StoryScene {
  title: string;
  location: string;
  setting: 'classroom' | 'hall' | 'yard' | 'city';
  lines: StoryLine[];
}
export const STORY: Record<
  'outbreak' | 'weapons' | 'hall' | 'yard' | 'ending',
  StoryScene
> = {
  outbreak: {
    title: '마지막 종이 울린 직후',
    location: '에피소드 0 · 양지고등학교 / 16:07',
    setting: 'classroom',
    lines: [
      {
        speaker: '교내 방송',
        job: null,
        text: '학생 여러분은… 교실에서… 문을 잠그고… 치지직—',
      },
      {
        speaker: '한도윤',
        job: 'vanguard',
        text: '복도에서 비명이 났어. 방금까지 우리랑 이야기하던 애가… 왜 저렇게 걷는 거야?',
      },
      {
        speaker: '백해인',
        job: 'medic',
        text: '유리창이 깨졌어. 저 돌이라도 던져서 가까이 못 오게 해. 아직 싸울 준비가 안 됐어.',
      },
      {
        speaker: '강시우',
        job: 'ranger',
        text: '체육관 쪽도 막혔어. 창가의 돌로 길을 벌리자. 혼자 뛰어나가면 안 돼.',
      },
      {
        speaker: '윤태오',
        job: 'engineer',
        text: '비상 장비함이 교실 뒤에 있어. 거기까지 가면 쓸 만한 도구를 찾을 수 있을 거야.',
      },
      {
        speaker: '보건교사 윤서',
        job: null,
        text: '모두 이쪽으로! 먼저 움직이는 법부터 익혀요. 방향키나 조이스틱으로 이동하고, 나에게 E / 상호작용으로 말을 걸어요.',
      },
    ],
  },
  weapons: {
    title: '우리에게 남은 선택',
    location: '교실 · 비상 장비함',
    setting: 'classroom',
    lines: [
      {
        speaker: '한도윤',
        job: 'vanguard',
        text: '체육대회 때 쓰던 배트야. 더는 돌만 던지고 있을 수 없어. 내가 앞을 막을게.',
      },
      {
        speaker: '백해인',
        job: 'medic',
        text: '구조용 신호총과 응급 가방도 있어. 도윤아, 다치면 내 쪽으로 와. 아무도 두고 가지 말자.',
      },
      {
        speaker: '강시우',
        job: 'ranger',
        text: '연습용 활과 화살이 있어. 내가 멀리서 길을 볼게. 집중 사격으로 길을 열고 신속 장전으로 엄호할게.',
      },
      {
        speaker: '윤태오',
        job: 'engineer',
        text: '비상용 전기봉은 아직 켜져 있어. 가까운 감염자를 잠깐 멈추고, 응급 방벽으로 버틸 시간을 만들 수 있어.',
      },
      {
        speaker: '보건교사 윤서',
        job: null,
        text: '각자 다른 직업의 무기를 얻었어요. J / 공격으로 무기를 쓰고 K·L / 스킬 버튼으로 각자의 능력을 사용하세요. 칠판의 번호로 비상문을 여세요.',
      },
    ],
  },
  hall: {
    title: '방송은 아직 끝나지 않았다',
    location: '교실 → 동관 복도',
    setting: 'hall',
    lines: [
      {
        speaker: '한도윤',
        job: 'vanguard',
        text: '문을 넘었어. 그런데 저 안전모… 시설관리 아저씨잖아. 교실의 감염자보다 훨씬 단단해 보여.',
      },
      {
        speaker: '백해인',
        job: 'medic',
        text: '체육복을 입은 애들은 빨라. 좁은 복도에서 흩어지면 위험해. 함께 움직이자.',
      },
      {
        speaker: '강시우',
        job: 'ranger',
        text: '내가 앞쪽을 엄호할게. 태오야, 전원이 끊긴 곳을 확인해 줘.',
      },
      {
        speaker: '윤태오',
        job: 'engineer',
        text: '시설관리 감염자는 한 번에 쓰러지지 않아. 전류로 멈춘 사이 거리를 벌리자.',
      },
      {
        speaker: '보건교사 윤서',
        job: null,
        text: '방송실 비상 전원을 복구하면 운동장 출입구를 열 수 있어요. 우선 나에게 경로를 확인해요.',
      },
    ],
  },
  yard: {
    title: '담장 너머의 구조 신호',
    location: '동관 → 운동장',
    setting: 'yard',
    lines: [
      {
        speaker: '교내 방송',
        job: null,
        text: '생존자는 운동장 정문으로… 구조 차량이 대기 중입니다. 정문 전원은 수동으로 연결하십시오.',
      },
      {
        speaker: '백해인',
        job: 'medic',
        text: '서쪽 전원과 동쪽 제어반, 둘 다 켜야 해. 문이 열릴 때까지 버텨야겠어.',
      },
      {
        speaker: '강시우',
        job: 'ranger',
        text: '정문까지 시야는 확보됐어. 뛰어오는 체육복 감염자부터 막을게.',
      },
      {
        speaker: '윤태오',
        job: 'engineer',
        text: '전원을 연결하면 감염자들이 몰려올 거야. 모두 가까이 와. 방벽을 준비할게.',
      },
      {
        speaker: '한도윤',
        job: 'vanguard',
        text: '저 차까지 모두 같이 가자. 오늘은 절대로 혼자 남게 두지 않을 거야.',
      },
    ],
  },
  ending: {
    title: '학교 밖의 첫 번째 밤',
    location: '운동장 → 봉쇄된 도시',
    setting: 'city',
    lines: [
      {
        speaker: '한도윤',
        job: 'vanguard',
        text: '학교만 그런 게 아니었어. 도시 전체가… 멈췄어.',
      },
      {
        speaker: '백해인',
        job: 'medic',
        text: '강 건너에서 불빛이 보여. 살아 있는 사람들이 있을 거야. 우리가 찾으러 가자.',
      },
      {
        speaker: '강시우',
        job: 'ranger',
        text: '넷이 할 수 있는 일이 서로 달랐기에 여기까지 왔어. 다음 길도 같이 찾자.',
      },
      {
        speaker: '윤태오',
        job: 'engineer',
        text: '장비는 계속 손보면 돼. 돌아갈 곳을 찾을 때까지 멈추지 말자.',
      },
      {
        speaker: '생존 기록',
        job: null,
        text: '돌을 던지던 학생들은 서로를 지키는 생존자가 되었다. 다음 이야기 — 에피소드 1: 버려진 도시.',
      },
    ],
  },
};
