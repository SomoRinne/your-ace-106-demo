/* Authorized all-question statistics. Source data, not the renderer, chooses chart type. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id), ns = 'http://www.w3.org/2000/svg';
  const colors = ['#a31122', '#4c5764', '#74836a', '#b18a54', '#8b7189', '#548486', '#a86745', '#7e7e7e'];
  const make = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text != null) node.textContent = String(text); return node; };
  const count = value => Number(value || 0).toLocaleString('ja-JP');
  const percentText = value => new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1 }).format(value) + '%';
  const percentOf = (choice, answered) => Number.isFinite(choice.percent) ? choice.percent : answered ? Number(choice.count || 0) / answered * 100 : 0;
  const colorOf = (choice, index) => colors[(Number.isInteger(choice.optionIndex) && choice.optionIndex >= 0 ? choice.optionIndex : index) % colors.length];
  const typeLabel = type => ({ short: '記述式', paragraph: '段落', email: 'メールアドレス', radio: '単一選択', select: 'プルダウン', checkbox: '複数選択', date: '日付', time: '時刻', scale: '均等目盛', grid: '選択式グリッド', checkboxGrid: '複数選択グリッド' }[type] || '記述式');
  function valueText(value) { if (value == null || value === '') return '（未入力）'; if (Array.isArray(value)) return value.map(valueText).join('、'); if (typeof value === 'object') return Object.hasOwn(value, 'value') ? String(value.value) + (value.otherText ? '：' + value.otherText : '') : Object.entries(value).map(([key, item]) => key + '：' + valueText(item)).join('\n'); return String(value); }
  function svgNode(tag, attrs) { const node = document.createElementNS(ns, tag); for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value)); return node; }
  function pie(question) {
    const box = make('div', 'pie-layout'), graphic = make('div', 'pie-chart'), legend = make('ul', 'pie-legend'), choices = question.choices || [];
    const total = choices.reduce((sum, choice) => sum + Math.max(0, Number(choice.count || 0)), 0);
    if (total) {
      const svg = svgNode('svg', { viewBox: '0 0 200 200', role: 'img', 'aria-label': (question.title || '') + 'の回答内訳' }); let start = -Math.PI / 2;
      choices.forEach((choice, index) => {
        const amount = Math.max(0, Number(choice.count || 0)); if (!amount) return;
        const end = start + amount / total * Math.PI * 2, fill = colorOf(choice, index);
        if (amount === total) svg.append(svgNode('circle', { cx: 100, cy: 100, r: 84, fill }));
        else svg.append(svgNode('path', { d: `M 100 100 L ${100 + 84 * Math.cos(start)} ${100 + 84 * Math.sin(start)} A 84 84 0 ${end - start > Math.PI ? 1 : 0} 1 ${100 + 84 * Math.cos(end)} ${100 + 84 * Math.sin(end)} Z`, fill }));
        start = end;
      }); graphic.append(svg);
    } else graphic.append(make('p', 'chart-empty', '回答なし'));
    choices.forEach((choice, index) => {
      const row = make('li'), swatch = make('span', 'legend-swatch'); swatch.style.backgroundColor = colorOf(choice, index); swatch.setAttribute('aria-hidden', 'true');
      row.append(swatch, make('span', 'legend-label', choice.label), make('span', 'legend-count', count(choice.count) + '件'), make('span', 'legend-percent', percentText(percentOf(choice, question.answered)))); legend.append(row);
    }); box.append(graphic, legend); return box;
  }
  function bars(question) {
    const box = make('div', 'bar-chart');
    for (const choice of question.choices || []) {
      const row = make('div', 'choice-bar-row'), track = make('div', 'bar-track'), fill = make('span', 'bar-fill'), percent = percentOf(choice, question.answered);
      fill.style.width = Math.max(0, Math.min(100, percent)) + '%'; track.append(fill);
      row.append(make('span', 'choice-label', choice.label), track, make('span', 'choice-count', count(choice.count) + '件'), make('span', 'choice-percent', percentText(percent))); box.append(row);
    }
    if (!(question.choices || []).length) box.append(make('p', 'chart-empty', '回答なし')); return box;
  }
  function textAnswers(question, index) {
    const box = make('div', 'text-answers' + (question.chartType === 'date' ? ' date-answers' : '')), list = make('ol', 'text-answer-list'), footer = make('div', 'text-answer-footer'), range = make('span', 'source-label'), actions = make('div', 'pagination');
    const previous = make('button', 'button quiet text-prev', '←'), next = make('button', 'button quiet text-next', '→'), answers = question.answers || [], size = 5; let page = 0;
    list.id = 'stats-answer-list-' + index; range.setAttribute('role', 'status');
    for (const [button, label] of [[previous, '前の回答'], [next, '次の回答']]) { button.type = 'button'; button.setAttribute('aria-label', (question.title || '') + 'の' + label); button.setAttribute('aria-controls', list.id); }
    function draw() {
      list.replaceChildren(); list.start = page * size + 1;
      for (const answer of answers.slice(page * size, (page + 1) * size)) { const item = make('li', '', valueText(answer.value)); item.dataset.responseId = String(answer.responseId || ''); list.append(item); }
      range.textContent = answers.length ? count(page * size + 1) + '–' + count(Math.min((page + 1) * size, answers.length)) + ' / ' + count(answers.length) + '件' : '0件';
      previous.disabled = page === 0; next.disabled = (page + 1) * size >= answers.length;
    }
    previous.addEventListener('click', () => { if (page) { page--; draw(); } }); next.addEventListener('click', () => { if ((page + 1) * size < answers.length) { page++; draw(); } });
    if (answers.length) { draw(); box.append(list); if (answers.length > size) { actions.append(previous, next); footer.append(range, actions); box.append(footer); } }
    else box.append(make('p', 'chart-empty', question.answered ? '回答の内訳を読み込めませんでした。' : 'まだ回答がありません。'));
    return box;
  }
  function renderQuestion(question, index, total) {
    const card = make('section', 'question-card question-stat'), header = make('header', 'question-card-header'), title = make('h3', 'question-card-title', question.title || question.id), meta = make('div', 'question-card-meta');
    title.id = 'stats-question-' + index; card.dataset.questionId = String(question.id); card.dataset.order = String(question.order ?? index); card.setAttribute('aria-labelledby', title.id);
    if (question.sectionTitle && question.sectionTitle !== question.title) header.append(make('p', 'question-context', question.sectionTitle));
    meta.append(make('span', 'question-type', typeLabel(question.type)), make('span', 'question-answered', '回答 ' + count(question.answered) + '件'), make('span', 'question-skipped', '未回答 ' + count(question.skipped ?? Math.max(0, total - Number(question.answered || 0))) + '件'));
    header.append(title, meta); card.append(header);
    card.append(question.chartType === 'pie' ? pie(question) : question.chartType === 'bar' ? bars(question) : textAnswers(question, index)); return card;
  }
  function sourceDate(raw) { const parsed = new Date(raw); return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(parsed) : String(raw); }
  function render(result) {
    $('stats-total').textContent = count(result.total); $('stats-contacts').textContent = count(result.uniqueContacts);
    const source = result.source || {}; $('stats-updated').textContent = [source.label || '', source.asOf ? '取得時点 ' + sourceDate(source.asOf) : ''].filter(Boolean).join(' ｜ ');
    const differs = Number.isFinite(source.referenceTotal) && source.referenceTotal !== Number(result.total);
    $('stats-reference').hidden = !differs; $('stats-reference').textContent = differs ? '元フォーム' + count(source.referenceTotal) + '件／この画面' + count(result.total) + '件（取得時点が異なります）' : '';
    $('stats-reference').title = differs && source.referenceAsOf ? '元フォームの確認時点 ' + sourceDate(source.referenceAsOf) : '';
    $('month-chart').replaceChildren(); const months = result.byMonth || [], max = Math.max(1, ...months.map(item => Number(item.count || 0)));
    for (const month of months) { const row = make('div', 'chart-row'), track = make('div', 'bar-track'), fill = make('span', 'bar-fill'); fill.style.width = Math.max(0, Number(month.count) / max * 100) + '%'; track.append(fill); row.append(make('span', 'chart-label', month.month), track, make('span', 'chart-count', count(month.count))); $('month-chart').append(row); }
    if (!months.length) $('month-chart').append(make('p', 'source-label', '回答が保存されると表示されます。'));
    $('question-stats').replaceChildren(); for (const [index, question] of (result.questions || []).entries()) $('question-stats').append(renderQuestion(question, index, Number(result.total || 0)));
    if (!(result.questions || []).length) $('question-stats').append(make('p', 'source-label', '質問の集計を読み込めませんでした。'));
  }
  window.AceStats = Object.freeze({ render });
})();
