// 앱의 규칙이 논문과 맞는지 확인한다. 실행: node tests/check.mjs (설치할 것 없음)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
const code = html.match(/<script id="logic">([\s\S]*?)<\/script>/)[1];
const box = {};
box.globalThis = box;
vm.runInNewContext(code, box);
const L = box.TasteLogic;

let fail = 0;
function check(name, ok, detail = '') {
  if (!ok) fail++;
  console.log(`${ok ? '통과' : '실패'}  ${name}${!ok && detail ? '\n      ' + detail : ''}`);
}
const values = (found) => Object.fromEntries(Object.entries(found).map(([k, v]) => [k, v.value]));
const same = (a, b) => L.KEYS.every((k) => a[k] === b[k]);

// 논문 표 5의 문장 3종
const PAPER = {
  A: '저는 산미가 강하고, 꽃향기와 시트러스 계열 과일향이 나며, 마시고 난 뒤 여운이 길고, 쓴맛이 약한 커피를 좋아합니다. 이런 취향에 맞는 원두를 5가지 추천해 주세요.',
  B: '강한 산미, 꽃향, 시트러스, 긴 여운, 약한 쓴맛. 이 취향에 맞는 원두를 5가지 추천해 주세요.',
  C: '오렌지나 자몽처럼 새콤하게 톡 쏘고, 꽃잎에서 나는 향이 나며, 마신 뒤에도 그 향이 입안에 오래 남고, 씁쓸함은 거의 없는 커피를 좋아해요. 이런 취향에 맞는 원두를 5가지 추천해 주세요.',
};

for (const s of ['A', 'B', 'C']) {
  const q = L.makeQuestion(L.TESTED, s);
  check(`시험한 취향의 질문 ${s}가 논문 문장과 글자까지 같다`, q === PAPER[s], q);
  const read = values(L.readTaste(PAPER[s]));
  check(`논문 문장 ${s}를 읽으면 5가지 모두 시험한 취향으로 읽힌다`, same(read, L.TESTED), JSON.stringify(read));
}

// 모든 조합이 깨진 문장을 만들지 않는다 (모르겠어요 포함)
const choices = L.ELEMENTS.map((e) => [...e.options.map((o) => o.v), 'unknown']);
let combos = 0, broken = [];
(function walk(i, picks) {
  if (i === choices.length) {
    combos++;
    const filled = L.countFilled(picks);
    for (const s of ['A', 'B', 'C']) {
      const q = L.makeQuestion(picks, s);
      if (filled === 0 ? q !== '' : (!q.includes('추천해 주세요.') || /undefined|null|, ,|  |^,|^ /.test(q))) broken.push([s, JSON.stringify(picks), q]);
    }
    return;
  }
  for (const v of choices[i]) walk(i + 1, { ...picks, [L.KEYS[i]]: v });
})(0, {});
check(`답 조합 ${combos}가지 × 말투 3종에서 깨진 문장이 없다`, broken.length === 0, broken.slice(0, 3).join(' | '));

// 사람이 쓸 법한 말
const CASES = [
  ['쓴 건 싫고 상큼한 커피가 좋아요', { bitter: 'weak', acid: 'strong' }],
  ['안 쓴 커피', { bitter: 'weak' }],
  ['신맛은 별로예요', { acid: 'weak' }],
  ['산미 강한 쓴맛 약한 커피', { acid: 'strong', bitter: 'weak' }],
  ['쓴맛 약하고 산미 강한 거', { bitter: 'weak', acid: 'strong' }],
  ['은은한 산미에 뒷맛 깔끔한 거', { acid: 'mid', finish: 'short' }],
  ['고소하고 초콜릿 향이 나는데 쌉쌀한 건 진했으면 좋겠어요. 뒷맛은 깔끔하게요', { aroma: 'nutty', bitter: 'strong', finish: 'short' }],
  ['꽃향은 싫어요', {}],
  ['과일향은 없었으면 해요', { fruit: 'none' }],
  ['딸기 같은 향이 좋아요', { fruit: 'berry' }],
  ['여운이 오래 남는 커피', { finish: 'long' }],
  ['건포도 같은 맛', { fruit: 'dried' }],
  ['말린 자두 느낌', { fruit: 'dried' }],
  ['자두 느낌', { fruit: 'stone' }],
  ['포도 맛', { fruit: 'berry' }],
];
for (const [text, want] of CASES) {
  const got = values(L.readTaste(text));
  const ok = Object.keys(want).length === Object.keys(got).length && Object.entries(want).every(([k, v]) => got[k] === v);
  check(`읽기: "${text}"`, ok, `기대 ${JSON.stringify(want)} / 결과 ${JSON.stringify(got)}`);
}

// 일상 표현은 값으로 옮기지 않고 찾기만 한다
for (const [text, words] of [['군고구마 같은 커피가 좋아요', ['군고구마']], ['보리차 같은 커피', ['보리차']], ['대추차랑 한약 느낌', ['대추차', '한약']], ['탄 맛 나는 거', ['탄 맛']]]) {
  const got = values(L.readTaste(text));
  check(`일상 표현 "${text}"는 칸을 정하지 않는다`, Object.keys(got).length === 0, JSON.stringify(got));
  check(`일상 표현 "${text}"를 찾아 묻는다`, JSON.stringify(Array.from(L.findEveryday(text))) === JSON.stringify(words), String(L.findEveryday(text)));
}
check('일상 표현과 맛 표현이 섞이면 맛 표현만 읽는다', values(L.readTaste('고구마 같은데 쓴맛은 약한 거')).bitter === 'weak');
check('구수하다는 말은 곡물 칸으로 읽는다', values(L.readTaste('구수한 향이 좋아요')).aroma === 'grain');

// 일상 표현은 여운을 뺀 칸만 제안한다
const hintOf = (text) => values(L.suggestFromEveryday(text));
const eq = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
for (const [text, want] of [
  ['군고구마 같은 커피', { acid: 'weak', aroma: 'caramel', fruit: 'none', bitter: 'weak' }],
  ['누룽지 느낌', { acid: 'weak', aroma: 'grain', fruit: 'none', bitter: 'weak' }],
  ['군밤 같은 거', { acid: 'weak', aroma: 'nutty', fruit: 'none', bitter: 'mid' }],
  ['한약 같은 커피', { acid: 'weak', aroma: 'tea', fruit: 'none', bitter: 'strong' }],
  ['탄 맛 나는 거', { acid: 'weak', fruit: 'none', bitter: 'strong' }],
  ['대추차 같은 거', { acid: 'mid', aroma: 'caramel', fruit: 'dried', bitter: 'weak' }],
  ['한약 같은 건 싫어요', {}],
  ['막걸리 같은 거', {}],
  ['그냥 맛있는 거', {}],
]) check(`제안: "${text}"`, eq(hintOf(text), want), JSON.stringify(hintOf(text)));
check('어떤 일상 표현도 여운은 제안하지 않는다', Object.values(L.HINTS).every((h) => !('finish' in h)));
check('제안 값이 모두 보기에 있다', Object.values(L.HINTS).every((h) => Object.entries(h).every(([k, v]) => L.ELEMENTS.find((e) => e.key === k).options.some((o) => o.v === v))));

// 잘못된 입력에도 멈추지 않는다
for (const bad of ['', '   ', 'asdf1234', '☕️☕️', '<script>alert(1)</script>', '가'.repeat(5000), null, undefined, 123]) {
  let ok = true;
  try { L.readTaste(bad); L.makeQuestion({}, 'Z'); L.makeQuestion(null, 'A'); } catch { ok = false; }
  check(`잘못된 입력에 멈추지 않는다: ${String(bad).slice(0, 20)}`, ok);
}

// 논문 표 11의 합
const FREQ = { '에티오피아 예가체프': [10, 10, 10], '케냐': [10, 10, 10], '파나마 게이샤': [10, 10, 8], '에티오피아 구지·시다모': [6, 8, 10], '르완다·부룬디': [9, 8, 5], '에티오피아 게이샤 계열': [6, 6, 6], '콜롬비아': [6, 3, 6] };
check('화면의 원두 빈도가 논문 표 11의 합과 같다', L.FREQUENCY.every(([n, c]) => FREQ[n].reduce((a, b) => a + b) === c));

console.log(fail ? `\n실패 ${fail}건` : '\n모두 통과');
process.exit(fail ? 1 : 0);
