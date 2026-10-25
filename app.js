import {
  sortStages,
  isStageUnlocked,
  isStageComplete,
  scoreQuiz,
  getPublishableFines,
  isQuizAvailable,
  pickRandom,
  checklistPercent,
} from './js/logic.js';

const PROGRESS_KEY = 'driving-progress-v1';
const DOCS_KEY = 'driving-docs-v1';
const SIM_QUESTIONS = 10;
const app = document.getElementById('app');
const navEl = document.getElementById('nav');

const data = { stages: null, fines: null, documents: null };
let progress = readJson(PROGRESS_KEY, {});

// ---------- Storage (per device) ----------
function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
}

// ---------- DOM helpers (textContent only) ----------
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? '' : v);
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
const back = (label, href) => el('a', { class: 'btn secondary', href }, `→ ${label}`);

async function load(key, path) {
  if (!data[key]) {
    const res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) throw new Error(path);
    data[key] = await res.json();
  }
  return data[key];
}

// ---------- Routes ----------
const routes = [
  [/^#?\/?$/, viewLanding],
  [/^#\/learn$/, viewLearn],
  [/^#\/stage\/([\w-]+)$/, (m) => viewStage(m[1])],
  [/^#\/quiz\/([\w-]+)$/, (m) => viewQuiz(m[1])],
  [/^#\/simulator$/, viewSimulator],
  [/^#\/fines$/, viewFines],
  [/^#\/documents$/, viewDocuments],
];

async function route() {
  const hash = location.hash || '#/';
  setActiveNav(hash);
  const match = routes.find(([re]) => re.test(hash));
  try {
    await (match ? match[1](hash.match(match[0])) : viewLanding());
  } catch {
    render(
      el('h2', {}, 'تعذّر تحميل هذه الصفحة'),
      el('p', {}, 'تحقّق من الاتصال، أو جرّب مرة أخرى بعد أن تكون متصلاً بالإنترنت مرة واحدة.'),
      back('الرئيسية', '#/')
    );
  }
}

function setActiveNav(hash) {
  // Stage and quiz pages belong to the learning tab.
  const section = /^#\/(stage|quiz)\//.test(hash) ? '#/learn' : hash;
  navEl.querySelectorAll('a').forEach((a) => {
    a.classList.toggle('active', a.getAttribute('href') === section);
  });
}

// ---------- Landing (interactive site home) ----------
async function viewLanding() {
  const stages = sortStages((await load('stages', 'content/stages.json')).stages);
  const done = stages.filter((s) => isStageComplete(stages, progress, s.id)).length;
  const pct = Math.round((done / stages.length) * 100);

  const features = [
    ['مسار متدرّج', 'ثلاث مراحل بالترتيب، لا تفتح التالية إلا بعد إكمال السابقة.', '#/learn'],
    ['اختبارات تفاعلية', 'اختبار بعد كل درس نظري، مع شرح لكل إجابة.', '#/quiz/stage1'],
    ['محاكي الامتحان', 'أسئلة عشوائية من بنك الأسئلة لتدريب الامتحان النظري.', '#/simulator'],
    ['قائمة الوثائق', 'تابع الوثائق المطلوبة للتسجيل في مدرسة السياقة.', '#/documents'],
    ['الغرامات والمخالفات', 'جدول الدرجات بعد التحقق من النص الرسمي.', '#/fines'],
  ];

  render(
    el('section', { class: 'hero' },
      el('h2', {}, 'تعلّم السياقة في الجزائر بخطوات واضحة'),
      el('p', {}, 'دروس مرتبة حسب قانون المرور، واختبارات، ومتابعة لتقدمك، وتعمل دون إنترنت بعد أول زيارة.'),
      el('div', { class: 'hero-actions' },
        el('a', { class: 'btn', href: '#/learn' }, 'ابدأ التعلّم'),
        el('button', { class: 'btn secondary', id: 'hero-install', hidden: true, onclick: promptInstall }, 'تنزيل التطبيق')
      ),
      el('div', { class: 'progress' },
        el('div', { class: 'progress-label' }, `تقدّمك: ${pct}%`),
        el('div', { class: 'progress-bar' }, el('div', { class: 'progress-fill', style: `width:${pct}%` }))
      )
    ),
    el('section', { class: 'grid' }, features.map(([title, text, href]) =>
      el('a', { class: 'feature', href },
        el('div', { class: 'card-title' }, title),
        el('p', { class: 'note' }, text)
      )
    )),
  );
  refreshInstallButtons();
}

// ---------- Learning path ----------
async function viewLearn() {
  const stages = sortStages((await load('stages', 'content/stages.json')).stages);
  render(
    el('h2', {}, 'مسار التعلّم'),
    el('div', { class: 'grid' }, stages.map((s) => {
      const unlocked = isStageUnlocked(stages, progress, s.id);
      const done = isStageComplete(stages, progress, s.id);
      const status = done ? 'مكتملة' : unlocked ? 'متاحة' : 'مقفلة';
      return el('a', {
        class: `card ${unlocked ? '' : 'locked'}`,
        href: unlocked ? `#/stage/${s.id}` : null,
        'aria-disabled': unlocked ? null : 'true',
      },
        el('div', { class: 'card-title' }, `المرحلة ${s.order}: ${s.title}`),
        el('div', { class: 'card-status' }, status)
      );
    })),
    back('الرئيسية', '#/')
  );
}

async function viewStage(id) {
  const stages = sortStages((await load('stages', 'content/stages.json')).stages);
  const stage = stages.find((s) => s.id === id);
  if (!stage) return render(el('p', {}, 'المرحلة غير موجودة.'), back('المسار', '#/learn'));
  if (!isStageUnlocked(stages, progress, id)) {
    return render(el('p', {}, 'هذه المرحلة مقفلة. أكمل المرحلة السابقة أولاً.'), back('المسار', '#/learn'));
  }

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
    children.push(el('a', { class: 'btn', href: `#/quiz/${stage.id}` }, 'بدء الاختبار'));
  } else {
    const done = isStageComplete(stages, progress, stage.id);
    children.push(el('button', {
      class: 'btn',
      disabled: done || null,
      onclick: () => {
        progress[stage.id] = { completed: true, score: null };
        writeJson(PROGRESS_KEY, progress);
        viewStage(stage.id);
      },
    }, done ? 'تم التدريب الميداني ✓' : 'أكملت التدريب الميداني'));
  }
  children.push(back('المسار', '#/learn'));
  render(...children);
}

// ---------- Quiz & simulator (both require an approved quiz) ----------
async function loadApprovedQuiz(stageId) {
  const stages = sortStages((await load('stages', 'content/stages.json')).stages);
  const stage = stages.find((s) => s.id === stageId);
  if (!stage || !stage.quiz) return { stage, quiz: null, reason: 'لا يوجد اختبار لهذه المرحلة.' };
  const res = await fetch(`content/${stage.quiz}`, { cache: 'no-cache' });
  const quiz = await res.json();
  if (!isQuizAvailable(quiz)) {
    return { stage, quiz: null, reason: 'أسئلة هذا الاختبار لم تُعتمد بعد من مختص، لذا لا يمكن بدؤه.' };
  }
  return { stage, quiz, reason: null };
}

async function viewQuiz(stageId) {
  const { stage, quiz, reason } = await loadApprovedQuiz(stageId);
  if (!quiz) {
    return render(el('h2', {}, 'الاختبار قيد المراجعة'), el('p', {}, reason), back('المسار', '#/learn'));
  }
  renderQuestions(`اختبار: ${stage.title}`, quiz.questions, stage.pass_score, (score) => {
    if (score >= stage.pass_score) {
      progress[stage.id] = { completed: true, score };
      writeJson(PROGRESS_KEY, progress);
    }
    return score >= stage.pass_score
      ? 'مبروك، اجتزت الاختبار.'
      : `تحتاج إلى ${stage.pass_score}% للنجاح. راجع الدروس وحاول مرة أخرى.`;
  }, `#/stage/${stage.id}`);
}

async function viewSimulator() {
  const { quiz, reason } = await loadApprovedQuiz('stage1_code');
  if (!quiz) {
    return render(el('h2', {}, 'المحاكي قيد المراجعة'), el('p', {}, reason), back('الرئيسية', '#/'));
  }
  const questions = pickRandom(quiz.questions, SIM_QUESTIONS);
  renderQuestions('محاكي امتحان الكود', questions, 80, (score) =>
    `نتيجتك في هذه المحاكاة: ${score}%`, '#/');
}

function renderQuestions(title, questions, passScore, finishMessage, backHref) {
  const answers = {};
  const form = el('div', { class: 'quiz' });
  questions.forEach((q, qi) => {
    form.append(el('div', { class: 'question' },
      el('p', {}, `${qi + 1}. ${q.text}`),
      q.choices.map((c, ci) => el('label', { class: 'choice' },
        el('input', { type: 'radio', name: q.id, value: ci, onchange: () => (answers[q.id] = ci) }),
        ` ${c}`
      ))
    ));
  });
  render(
    el('h2', {}, title),
    form,
    el('button', {
      class: 'btn',
      onclick: () => {
        const quizLike = { status: 'approved', questions };
        const score = scoreQuiz(quizLike, answers);
        render(
          el('h2', {}, `النتيجة: ${score}%`),
          el('p', {}, finishMessage(score)),
          back('العودة', backHref)
        );
      },
    }, 'تسليم الإجابات'),
    back('إلغاء', backHref)
  );
}

// ---------- Fines ----------
async function viewFines() {
  const fines = await load('fines', 'content/fines.json');
  const published = getPublishableFines(fines);
  render(
    el('h2', {}, 'الغرامات والمخالفات'),
    published.length === 0
      ? el('p', { class: 'note' }, 'الغرامات قيد التحقق من النص الرسمي، وستظهر هنا بعد اعتمادها.')
      : published.map((f) => el('div', { class: 'card' },
          el('div', { class: 'card-title' }, `الدرجة ${f.degree}: ${f.fine_dza} دج`),
          el('ul', {}, f.offences.map((o) => el('li', {}, o)))
        )),
    back('الرئيسية', '#/')
  );
}

// ---------- Documents checklist (saved on device) ----------
async function viewDocuments() {
  const docs = await load('documents', 'content/documents.json');
  let checked = readJson(DOCS_KEY, []);
  const bar = el('div', { class: 'progress' });
  const label = el('div', { class: 'progress-label' });
  const fill = el('div', { class: 'progress-fill' });
  bar.append(label, el('div', { class: 'progress-bar' }, fill));

  const refresh = () => {
    const pct = checklistPercent(docs.items, checked);
    label.textContent = `اكتمل ${pct}%`;
    fill.style.width = `${pct}%`;
  };

  const boxes = docs.items.map((item) => {
    const input = el('input', {
      type: 'checkbox',
      checked: checked.includes(item.id) || null,
      onchange: (e) => {
        checked = e.target.checked ? [...checked, item.id] : checked.filter((x) => x !== item.id);
        writeJson(DOCS_KEY, checked);
        refresh();
      },
    });
    return el('label', { class: 'choice' }, input, el('span', {}, item.label),
      item.note ? el('span', { class: 'note' }, ` (${item.note})`) : null);
  });

  render(
    el('h2', {}, 'قائمة الوثائق'),
    el('h3', {}, 'الشروط الأساسية'),
    el('ul', {}, docs.conditions.map((c) => el('li', {}, c.label))),
    el('h3', {}, 'ملف التسجيل (يُودع لدى مدرسة السياقة المعتمدة)'),
    bar,
    el('div', { class: 'question' }, boxes),
    el('p', { class: 'note' }, docs.disclaimer),
    back('الرئيسية', '#/')
  );
  refresh();
}

// ---------- Install (PWA) ----------
let deferredPrompt = null;
const isStandalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
const iosHint = document.getElementById('ios-hint');
const topInstall = document.getElementById('install-btn');

function refreshInstallButtons() {
  const show = !isStandalone && deferredPrompt !== null;
  topInstall.hidden = !show;
  const hero = document.getElementById('hero-install');
  if (hero) hero.hidden = !show;
}

async function promptInstall() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  refreshInstallButtons();
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  refreshInstallButtons();
});
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  refreshInstallButtons();
  iosHint.hidden = true;
});
topInstall.addEventListener('click', promptInstall);
if (isIos && !isStandalone) iosHint.hidden = false;

// ---------- Service worker ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// ---------- Boot ----------
function renderNav() {
  const links = [
    ['الرئيسية', '#/'],
    ['المسار', '#/learn'],
    ['المحاكي', '#/simulator'],
    ['الوثائق', '#/documents'],
    ['الغرامات', '#/fines'],
  ];
  navEl.replaceChildren(...links.map(([label, href]) => el('a', { href }, label)));
}

renderNav();
window.addEventListener('hashchange', route);
if (location.protocol === 'file:') {
  // The inline script in index.html already shows the file:// message.
} else {
  route();
}
