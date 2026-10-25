import {
  sortStages,
  isStageUnlocked,
  isStageComplete,
  scoreQuiz,
  getPublishableFines,
  isQuizAvailable,
} from './js/logic.js';

const PROGRESS_KEY = 'driving-progress-v1';
const app = document.getElementById('app');

const state = { stages: [], fines: null, progress: loadProgress() };

// ---------- Progress (per device, localStorage) ----------
function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {};
  } catch {
    return {};
  }
}
function saveProgress() {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(state.progress));
  } catch {
    // Storage unavailable (private mode): progress lasts only this session.
  }
}

// ---------- DOM helpers (textContent only, no innerHTML from content) ----------
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}
function render(...nodes) {
  app.replaceChildren(...nodes);
  window.scrollTo(0, 0);
}
function nav(label, onClick) {
  return el('button', { class: 'btn secondary', onclick: onClick }, label);
}

// ---------- Screens ----------
function showHome() {
  const stages = sortStages(state.stages);
  const cards = stages.map((s) => {
    const unlocked = isStageUnlocked(stages, state.progress, s.id);
    const done = isStageComplete(stages, state.progress, s.id);
    const status = done ? 'مكتملة' : unlocked ? 'متاحة' : 'مقفلة';
    return el(
      'button',
      {
        class: `card ${unlocked ? '' : 'locked'}`,
        disabled: unlocked ? null : '',
        onclick: () => showStage(s.id),
      },
      el('div', { class: 'card-title' }, `المرحلة ${s.order}: ${s.title}`),
      el('div', { class: 'card-status' }, status)
    );
  });

  render(
    el('h2', {}, 'مسار التعلّم'),
    ...cards,
    el('hr'),
    el('button', { class: 'btn', onclick: showFines }, 'الغرامات والمخالفات'),
    el('p', { class: 'note' }, 'تُحفظ التقدم على هذا الجهاز فقط.')
  );
}

function showStage(stageId) {
  const stage = state.stages.find((s) => s.id === stageId);
  const stages = sortStages(state.stages);
  const hasVideo = stage.video_url && stage.video_url !== 'TO_VERIFY';

  const children = [
    el('h2', {}, stage.title),
    el('h3', {}, 'المحتوى'),
    el('ul', {}, stage.topics.map((t) => el('li', {}, t))),
  ];

  if (stage.note) children.push(el('p', { class: 'note' }, stage.note));

  children.push(
    hasVideo
      ? el('a', { class: 'btn', href: stage.video_url, target: '_blank', rel: 'noopener' }, '🎥 فيديو تعليمي')
      : el('p', { class: 'note' }, '🎥 الفيديو التعليمي قيد الإعداد.')
  );

  if (stage.quiz_required) {
    children.push(
      el('button', { class: 'btn', onclick: () => startQuiz(stage) }, 'بدء الاختبار')
    );
  } else {
    const done = isStageComplete(stages, state.progress, stage.id);
    children.push(
      el(
        'button',
        {
          class: 'btn',
          disabled: done ? '' : null,
          onclick: () => {
            state.progress[stage.id] = { completed: true, score: null };
            saveProgress();
            showStage(stage.id);
          },
        },
        done ? 'تم التدريب الميداني ✓' : 'أكملت التدريب الميداني'
      )
    );
  }

  children.push(nav('→ العودة', showHome));
  render(...children);
}

async function startQuiz(stage) {
  let quiz;
  try {
    const res = await fetch(`content/${stage.quiz}`, { cache: 'no-cache' });
    quiz = await res.json();
  } catch {
    return render(
      el('p', {}, 'تعذّر تحميل الاختبار. تحقّق من الاتصال.'),
      nav('→ العودة', () => showStage(stage.id))
    );
  }

  if (!isQuizAvailable(quiz)) {
    return render(
      el('h2', {}, 'الاختبار قيد المراجعة'),
      el('p', {}, 'أسئلة هذا الاختبار لم تُعتمد بعد من مختص، لذا لا يمكن بدؤه.'),
      nav('→ العودة', () => showStage(stage.id))
    );
  }

  renderQuiz(stage, quiz);
}

function renderQuiz(stage, quiz) {
  const answers = {};
  const form = el('div', { class: 'quiz' });

  quiz.questions.forEach((q, qi) => {
    const choices = q.choices.map((c, ci) =>
      el(
        'label',
        { class: 'choice' },
        el('input', {
          type: 'radio',
          name: q.id,
          value: ci,
          onchange: () => (answers[q.id] = ci),
        }),
        ` ${c}`
      )
    );
    form.append(el('div', { class: 'question' }, el('p', {}, `${qi + 1}. ${q.text}`), ...choices));
  });

  const submit = el(
    'button',
    {
      class: 'btn',
      onclick: () => {
        const score = scoreQuiz(quiz, answers);
        const passed = score >= stage.pass_score;
        if (passed) {
          state.progress[stage.id] = { completed: true, score };
          saveProgress();
        }
        render(
          el('h2', {}, `النتيجة: ${score}%`),
          el(
            'p',
            {},
            passed
              ? 'مبروك، اجتزت الاختبار.'
              : `تحتاج إلى ${stage.pass_score}% للنجاح. راجع الدروس وحاول مرة أخرى.`
          ),
          nav('→ العودة إلى المرحلة', () => showStage(stage.id))
        );
      },
    },
    'تسليم الإجابات'
  );

  render(el('h2', {}, `اختبار: ${stage.title}`), form, submit, nav('→ إلغاء', () => showStage(stage.id)));
}

async function showFines() {
  if (!state.fines) {
    try {
      const res = await fetch('content/fines.json', { cache: 'no-cache' });
      state.fines = await res.json();
    } catch {
      return render(el('p', {}, 'تعذّر تحميل المعلومات. تحقّق من الاتصال.'), nav('→ العودة', showHome));
    }
  }

  const published = getPublishableFines(state.fines);
  const body =
    published.length === 0
      ? el('p', { class: 'note' }, 'الغرامات قيد التحقق من النص الرسمي، وستظهر هنا بعد اعتمادها.')
      : el(
          'div',
          {},
          published.map((f) =>
            el(
              'div',
              { class: 'card' },
              el('div', { class: 'card-title' }, `الدرجة ${f.degree}: ${f.fine_dza} دج`),
              el('ul', {}, f.offences.map((o) => el('li', {}, o)))
            )
          )
        );

  render(el('h2', {}, 'الغرامات والمخالفات'), body, nav('→ العودة', showHome));
}

// ---------- Install (PWA) ----------
let deferredPrompt = null;
const installBtn = document.getElementById('install-btn');
const iosHint = document.getElementById('ios-hint');

const isStandalone =
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (!isStandalone) installBtn.hidden = false;
});

installBtn.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBtn.hidden = true;
});

window.addEventListener('appinstalled', () => {
  installBtn.hidden = true;
  iosHint.hidden = true;
});

// iOS does not fire beforeinstallprompt; show manual instructions instead.
if (isIos && !isStandalone) iosHint.hidden = false;

// ---------- Service worker ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// ---------- Boot ----------
async function boot() {
  if (location.protocol === 'file:') {
    return render(
      el('h2', {}, 'افتح التطبيق من رابط إنترنت'),
      el('p', {}, 'هذا الملف لا يعمل إذا فُتح مباشرة من الجهاز. افتح الرابط الذي نُشر فيه التطبيق من المتصفح.')
    );
  }
  try {
    const res = await fetch('content/stages.json', { cache: 'no-cache' });
    state.stages = (await res.json()).stages;
    showHome();
  } catch {
    render(el('p', {}, 'تعذّر تحميل المحتوى. تحقّق من الاتصال.'));
  }
}

document.getElementById('disclaimer').textContent =
  'هذه المعلومات للتوعية والتعليم فقط وليست بديلاً عن النص الرسمي المنشور في الجريدة الرسمية.';

boot();
