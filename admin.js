(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const make = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text != null) node.textContent = String(text); return node; };
  const number = value => Number(value || 0).toLocaleString('ja-JP');
  const pageSize = 50;
  const preview = window.AcePreview.create($('form-preview'));
  let token = null, view = 'form', busy = false, publicUrl = '', storageStatus = null;
  let answerOffset = 0, answerTotal = 0, answerSequence = 0, searchTimer;
  let matchResult = null, matchStatus = 'all', matchPage = 0, matchSequence = 0;
  const caseDialog = $('match-case-dialog');
  let activeCaseRowId = null;
  const workflow = window.AceWorkflow.create({ request, action, notice, rerender: renderMatches, safeUrl, formatDate: value => date(value) });
  window.setInterval(() => { if (token && !busy && !$('panel-match').hidden && !$('workflow-setup').open && !$('answer-dialog').open && !$('workflow-dialog').open && !caseDialog.open && workflow.automaticEnabled?.()) action(loadMatch); }, 15000);
  let pendingAnswerId = (() => { try { if (typeof window.ACE_RESPONSE_ID === 'string' && window.ACE_RESPONSE_ID) return window.ACE_RESPONSE_ID; return location.hash.startsWith('#answer=') ? decodeURIComponent(location.hash.slice(8)) : new URL(location.href).searchParams.get('responseId') || ''; } catch { return ''; } })();
  const date = value => {
    if (!value) return '日時不明';
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(parsed) : String(value);
  };
  const formatValue = value => value == null || value === '' ? '（未入力）' : Array.isArray(value) ? value.map(formatValue).join('、') : typeof value === 'object' ? Object.hasOwn(value, 'value') ? String(value.value) + (value.otherText ? '：' + value.otherText : '') : Object.entries(value).map(([key, item]) => key + '：' + formatValue(item)).join('\n') : String(value);
  function showError(error) {
    const message = error?.message || '処理できませんでした。もう一度お試しください。';
    if (caseDialog.open) { $('match-case-error').textContent = message; $('match-case-error').hidden = false; return; }
    $('error-text').textContent = message; $('error-banner').hidden = false;
  }
  function notice(message) { $('notice').textContent = message; }
  function emptyRow(body, message, columns = 5) { const row = make('tr'), cell = make('td', 'empty-row', message); cell.colSpan = columns; row.append(cell); body.replaceChildren(row); }
  function controls() {
    for (const id of ['history-file', 'history-warning-import', 'clients-file', 'match-import']) $(id).disabled = busy;
    $('match-export').disabled = busy || !shownMatches().length;
    for (const button of document.querySelectorAll('#main-tabs button,.detail-button')) button.disabled = busy;
    for (const id of ['answers-search','match-search']) $(id).disabled = busy;
    $('answers-prev').disabled = busy || answerOffset === 0;
    $('answers-next').disabled = busy || answerOffset + pageSize >= answerTotal;
    document.body.dataset.busy = String(busy);
  }
  function resetSession(message) {
    token = null; publicUrl = ''; storageStatus = null; matchResult = null; answerTotal = 0; answerOffset = 0;
    answerSequence++; matchSequence++; closeMatchCase(false); workflow.reset();
    $('admin-app').hidden = true; $('login-panel').hidden = false; preview.clear();
    for (const id of ['answer-rows', 'match-rows', 'detail-fields', 'month-chart', 'question-stats']) $(id).replaceChildren();
    $('answer-dialog').close(); $('detail-title').textContent = '回答の詳細'; $('detail-meta').textContent = ''; $('history-progress').textContent = ''; $('stats-total').textContent = '—'; $('stats-contacts').textContent = '—'; $('stats-updated').textContent = ''; $('stats-reference').textContent = ''; $('stats-reference').hidden = true;
    $('answers-search').value = ''; $('match-search').value = ''; $('match-sort').value = 'newest'; $('history-file').value = ''; $('clients-file').value = '';
    $('login-error').textContent = message || ''; $('login-error').hidden = !message; $('password').value = ''; $('password').focus();
    document.body.dataset.authenticated = 'false';
  }
  async function request(method, payload = {}) {
    const current = token;
    const result = await window.AceAPI.call(method, { ...payload, token: current });
    if (token !== current) throw new Error('画面の状態が変わりました。');
    return result;
  }
  async function action(operation, message) {
    if (busy || !token) return;
    busy = true; $('error-banner').hidden = true; $('match-case-error').hidden = true; controls();
    try { await operation(); if (message) notice(message); }
    catch (error) {
      if (['UNAUTHORIZED', 'AUTH_REQUIRED', 'SESSION_EXPIRED', 'INVALID_TOKEN'].includes(error.code)) resetSession('ログインの有効期限が切れました。もう一度ログインしてください。');
      else if (token) showError(error);
    } finally { busy = false; controls(); }
  }
  function safeUrl(raw) {
    try { const url = new URL(raw, location.href); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
  }
  async function refreshStatus() {
    storageStatus = await request('status');
    publicUrl = safeUrl(storageStatus.publicFormUrl || new URL('/form/', location.href).href);
    $('answers-total').textContent = number(storageStatus.total);
    $('history-warning').hidden = storageStatus.legacyImport?.status !== 'pending';
    $('open-form-link').href = publicUrl; $('open-form-link').hidden = !publicUrl;
    if (publicUrl) preview.load(publicUrl);
  }
  async function loadAnswers() {
    const sequence = ++answerSequence;
    emptyRow($('answer-rows'), '読み込み中…');
    const result = await request('list', { q: $('answers-search').value.trim(), offset: answerOffset, limit: pageSize });
    if (sequence !== answerSequence) return;
    answerTotal = Number(result.total || 0); $('answers-total').textContent = number(answerTotal); $('answer-rows').replaceChildren();
    for (const item of result.rows || []) {
      const row = make('tr');
      row.append(make('td', 'answer-date', date(item.timestamp)), make('td', 'contact-name', item.name || '氏名なし'), make('td', 'contact-email', item.email || 'メールなし'), make('td', 'source-cell', /history|legacy|import|csv/i.test(item.source || '') ? '過去回答' : 'フォーム'));
      const cell = make('td'), button = make('button', 'button quiet detail-button', '詳細'); button.type = 'button'; button.setAttribute('aria-label', (item.name || '回答') + 'の詳細');
      button.addEventListener('click', () => action(() => openDetail(item.id))); cell.append(button); row.append(cell); $('answer-rows').append(row);
    }
    if (!(result.rows || []).length) emptyRow($('answer-rows'), $('answers-search').value ? '該当する回答がありません' : '保存済みの回答がありません');
    $('answers-range').textContent = answerTotal ? number(answerOffset + 1) + '–' + number(Math.min(answerOffset + pageSize, answerTotal)) + ' / ' + number(answerTotal) + '件' : '0件';
    $('answers-page').textContent = (Math.floor(answerOffset / pageSize) + 1) + ' / ' + Math.max(1, Math.ceil(answerTotal / pageSize)); controls();
  }
  async function openDetail(id) {
    const result = await request('detail', { id });
    $('detail-title').textContent = result.name || '回答の詳細';
    $('detail-meta').textContent = [date(result.timestamp), result.email, result.clientId ? '管理番号 ' + result.clientId : '', result.requestId ? '依頼番号 ' + result.requestId : '', result.source ? /history|legacy|import|csv/i.test(result.source) ? '既存フォームの過去回答' : '新フォーム' : ''].filter(Boolean).join(' ｜ ');
    $('detail-fields').replaceChildren();
    for (const field of result.fields || []) $('detail-fields').append(make('dt', '', field.title || field.id), make('dd', '', formatValue(field.value)));
    if (!(result.fields || []).length) $('detail-fields').append(make('dd', '', '回答項目がありません。'));
    $('answer-dialog').showModal();
  }
  async function loadStats() {
    $('question-stats').replaceChildren(make('p', 'source-label', '読み込み中…'));
    const result = await request('stats'); window.AceStats.render(result);
  }
  const diagnostics = () => new Map((matchResult?.diagnostics?.rows || []).map(item => [String(item.source_row), item]));
  function latestAnswerTime(row, details) {
    let latest = -Infinity;
    for (const candidate of details.get(String(row.source_row))?.candidates || []) {
      const value = typeof window.YourAceMatching?.parseDatetime === 'function' ? window.YourAceMatching.parseDatetime(candidate.timestamp) : candidate.timestamp;
      const time = value ? Date.parse(value) : NaN;
      if (Number.isFinite(time)) latest = Math.max(latest, time);
    }
    return latest;
  }
  const visibleMatchStatus = row => row.manual_confirmation ? 'answered' : row.status;
  function refreshMatchCounts() {
    const rows = matchResult?.rows || [];
    const count = status => rows.filter(row => visibleMatchStatus(row) === status).length;
    $('match-total').textContent = number(rows.length);
    for (const status of ['answered','review','candidate']) $('match-count-' + status).textContent = number(count(status));
  }
  function shownMatches() {
    const query = $('match-search').value.trim().toLowerCase(), details = diagnostics();
    const rows = (matchResult?.rows || []).filter(row => workflow.visible(row) && (matchStatus === 'all' || visibleMatchStatus(row) === matchStatus) && (!query || [row.client_id, row.name, ...(row.emails || []), ...(details.get(String(row.source_row))?.candidates || []).flatMap(item => [item.name, item.email])].some(value => String(value || '').toLowerCase().includes(query))));
    return rows.map((row, index) => ({ row, index, time: latestAnswerTime(row, details), rank: workflow.handlingRank(row) }))
      .sort((a, b) => ($('match-sort').value === 'handling' ? a.rank - b.rank : 0) || b.time - a.time || a.index - b.index).map(item => item.row);
  }
  function contact(name, emails, difference) {
    const box = make('div', 'contact-source'); box.append(make('span', 'contact-name' + (difference === 'name' ? ' difference' : ''), name || '氏名なし'));
    for (const email of emails.length ? emails : ['メールなし']) box.append(make('span', 'contact-email' + (difference === 'email' ? ' difference' : ''), email)); return box;
  }
  function candidateOf(detail) { return (detail?.manual_confirmation && detail.candidates?.find(c => c.response_id === detail.manual_confirmation.responseId)) || [...(detail?.candidates || [])].sort((a, b) => Number(b.pair_type === 'both') - Number(a.pair_type === 'both') || (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0))[0]; }
  function matchLabel(row, detail) { return row.manual_confirmation ? '確認済み（手動）' : row.status === 'candidate' ? '未回答' : row.status === 'answered' && (row.match_method === 'id' || detail?.classification === 'id_linked') ? '依頼IDで一致' : row.status === 'answered' ? '氏名・メール一致' : detail?.classification === 'name_only' ? '氏名のみ一致' : detail?.classification === 'email_only' ? 'メールのみ一致' : '要確認'; }
  function matchIcon(kind) {
    const ns = 'http://www.w3.org/2000/svg', icon = document.createElementNS(ns, 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true');
    icon.setAttribute('focusable', 'false');
    icon.setAttribute('class', kind === 'warning' ? 'match-warning-icon' : 'match-confirm-icon');
    const mark = document.createElementNS(ns, 'path');
    if (kind === 'warning') {
      mark.setAttribute('fill', 'currentColor');
      mark.setAttribute('fill-rule', 'evenodd');
      mark.setAttribute('d', 'M10.27 4.21a2 2 0 0 1 3.46 0l8.43 14.58a2 2 0 0 1-1.73 3H3.57a2 2 0 0 1-1.73-3l8.43-14.58ZM11 9v5h2V9h-2Zm1 7a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3Z');
    } else {
      mark.setAttribute('fill', 'none');
      mark.setAttribute('stroke', 'currentColor');
      mark.setAttribute('stroke-width', '2.5');
      mark.setAttribute('stroke-linecap', 'round');
      mark.setAttribute('stroke-linejoin', 'round');
      mark.setAttribute('d', 'm5 12 4 4L19 6');
    }
    icon.append(mark);
    return icon;
  }
  function manualMatchControls(row, detail) {
    const allowed = detail?.manual_candidates || [];
    const candidates = (detail?.candidates || []).filter(item => allowed.includes(item.response_id));
    if (row.manual_confirmation || !candidates.length) return null;

    const section = make('div', 'manual-match-action');
    const confirm = make('button', 'button primary manual-match-confirm', '一致として確定');
    confirm.type = 'button';
    confirm.prepend(matchIcon('confirm'));
    let selected = candidates.length === 1 ? candidates[0].response_id : '';
    if (candidates.length === 1) section.append(make('strong', 'manual-match-heading', '今回の回答を確定'));
    if (candidates.length > 1) {
      const options = make('fieldset', 'manual-match-options');
      options.append(make('legend', '', '今回の回答を選択'));
      for (const item of candidates) {
        const radio = make('input'); radio.type = 'radio'; radio.name = 'manual-match-answer';
        const option = make('label', 'manual-match-option');
        option.append(radio);
        const text = make('span', 'manual-match-choice');
        text.append(make('strong', '', date(item.timestamp)), make('span', '', item.name || item.email));
        option.append(text);
        radio.addEventListener('change', () => { if (radio.checked) { selected = item.response_id; confirm.disabled = false; } });
        options.append(option);
      }
      section.append(options);
    }
    confirm.disabled = !selected;
    confirm.addEventListener('click', () => action(async () => {
      const payload = {clientId:row.client_id, responseId:selected, expectedBasis:detail.manual_basis, expectedCandidates:allowed};
      const result = await request('workflowConfirmMatch', payload);
      matchResult = result.match;
      refreshMatchCounts();
      await workflow.load();
      workflow.selectManualCase?.(row.client_id);
      renderMatches();
      notice('一致として確定しました');
    }));
    section.append(confirm);
    return section;
  }
  function matchDetails(row, detail) {
    const details = make('article', 'detail-row match-case-content'), grid = make('div', 'match-details');
    const identification = make('div', 'match-case-id');
    identification.append(make('strong', 'contact-name', row.name || '氏名なし'));
    if (row.client_id) identification.append(make('span', 'source-label', '管理番号 ' + row.client_id));
    details.append(identification);
    const lu = make('div', 'match-case-source'), form = make('div', 'match-case-source'); lu.append(make('h3', '', 'LUの登録'), contact(row.name, row.emails || []));
    form.append(make('h3', '', 'フォームの回答'));
    for (const item of detail?.candidates || []) { const box = make('div', 'detail-candidate'); const difference = !row.manual_confirmation && row.status === 'review' ? comparedField(item) : ''; box.append(contact(item.name, [item.email || ''], difference), make('p', 'source-label', date(item.timestamp))); if (item.other_lu_exact_count) box.append(make('p', 'source-label', '別の登録にも一致')); if (item.time_condition === 'unknown') box.append(make('p', 'source-label', '回答日時を確認してください')); if (item.response_id) { const open = make('button', 'button quiet open-saved-answer', '保存済み回答を開く'); open.type = 'button'; open.addEventListener('click', () => action(() => openDetail(item.response_id))); box.append(open); } form.append(box); }
    if (!(detail?.candidates || []).length) form.append(make('p', 'source-label', row.status === 'candidate' ? '今回の依頼への回答はまだありません。' : '一致する回答がありません。'));
    const pastResponses = (detail?.past_responses || []).filter(item => typeof item.response_id === 'string' && item.response_id);
    if (pastResponses.length) {
      const past = make('details', 'past-answer-section'); past.append(make('summary', '', '過去の回答（今回分ではありません）'));
      for (const item of pastResponses) { const box = make('div', 'detail-candidate'); box.append(contact(item.name, [item.email || '']), make('p', 'source-label', date(item.timestamp))); const open = make('button', 'button quiet open-saved-answer', '過去の保存済み回答を開く'); open.type = 'button'; open.addEventListener('click', () => action(() => openDetail(item.response_id))); box.append(open); past.append(box); }
      form.append(past);
    }
    grid.append(lu, form);
    if (row.status !== 'answered' && !row.manual_confirmation && row.reason) {
      if (isPartialMismatch(row, detail)) {
        const key = detail.classification === 'email_only' ? '氏名' : 'メールアドレス';
        const note = make('p', 'detail-reason match-mismatch-note');
        note.append(matchIcon('warning'), make('strong', '', key + 'が異なります'));
        grid.append(note);
        const otherReasons = row.reason.split(' / ').filter(reason => reason !== '氏名のみ・メールのみ一致する回答がある');
        if (otherReasons.length) grid.append(make('p', 'detail-reason', otherReasons.join(' / ')));
      } else grid.append(make('p', 'detail-reason', row.reason));
    }
    const confirmation = manualMatchControls(row, detail);
    if (confirmation) grid.append(confirmation);
    if (row.client_id) {
      const editor = workflow.editor(row, detail?.candidates || []);
      if (row.status === 'review' || row.manual_confirmation) {
        const progress = make('details', 'case-progress-disclosure');
        progress.append(make('summary', '', '弁護士・事務の進捗'), editor);
        grid.append(progress);
      } else grid.append(editor);
    }
    details.append(grid); return details;
  }
  function isPartialMismatch(row, detail) { return row.status === 'review' && ['name_only', 'email_only'].includes(detail?.classification); }
  function matchBadge(row, detail) {
    if (row.manual_confirmation) return {kind:'answered', label:matchLabel(row, detail)};
    if (isPartialMismatch(row, detail)) return {kind:'mismatch', label:'不一致'};
    return {kind:['answered','candidate'].includes(row.status) ? row.status : 'review', label:matchLabel(row, detail)};
  }
  function paintMatchBadge(badge, row, detail) {
    const {kind, label} = matchBadge(row, detail);
    badge.className = 'match-badge ' + kind;
    badge.textContent = label;
    if (kind === 'mismatch') badge.prepend(matchIcon('warning'));
    return badge;
  }
  function comparedField(candidate) { return candidate?.pair_type === 'name_only' ? 'email' : candidate?.pair_type === 'email_only' ? 'name' : ''; }
  function showDifference(row, detail, candidate, cell) {
    if (row.status !== 'review' || row.manual_confirmation || !candidate) return;
    if (candidate.pair_type !== 'name_only' && candidate.pair_type !== 'email_only') return;
    const type = candidate.pair_type === 'name_only' ? 'メール' : '氏名';
    const registered = type === 'メール' ? (row.emails || []).filter(Boolean).join(' / ') : row.name;
    const submitted = type === 'メール' ? candidate.email : candidate.name;
    const comparison = make('div', 'match-difference');
    for (const [label, value] of [['LU', registered], ['回答', submitted]]) {
      const line = make('div', 'match-difference-line');
      line.append(make('span', 'match-origin', label), make('span', label === '回答' ? 'difference' : '', type + '：' + (value || '記載なし')));
      comparison.append(line);
    }
    cell.append(comparison);
  }
  function focusMatchTrigger(id) {
    if (!token || view !== 'match') return;
    const row = [...$('match-rows').querySelectorAll('[data-record]')].find(item => item.dataset.record === id);
    (row?.querySelector('.row-toggle') || $('tab-match')).focus({preventScroll:true});
  }
  function clearMatchCase(focus = true) {
    const id = activeCaseRowId;
    activeCaseRowId = null; document.body.classList.remove('case-dialog-open');
    $('match-case-content').replaceChildren(); delete $('match-case-content').dataset.record;
    if (focus && id !== null) focusMatchTrigger(id);
  }
  function closeMatchCase(focus = true) {
    if (caseDialog.open) caseDialog.close();
    clearMatchCase(focus);
  }
  function renderMatchCase(details = diagnostics()) {
    if (activeCaseRowId === null) return;
    const row = (matchResult?.rows || []).find(item => String(item.source_row) === activeCaseRowId);
    if (!row) { closeMatchCase(); return; }
    const detail = details.get(activeCaseRowId), badge = $('match-case-status'), scroll = $('match-case-scroll').scrollTop;
    paintMatchBadge(badge, row, detail);
    const container = $('match-case-content'), wasInside = container.contains(document.activeElement);
    const progressWasOpen = container.dataset.record === activeCaseRowId && container.querySelector('.case-progress-disclosure')?.open;
    container.replaceChildren(matchDetails(row, detail)); container.dataset.record = activeCaseRowId;
    const disclosure = container.querySelector('.case-progress-disclosure'); if (disclosure && progressWasOpen) disclosure.open = true;
    $('match-case-scroll').scrollTop = scroll;
    if (wasInside && caseDialog.open) $('match-case-close').focus({preventScroll:true});
  }
  function openMatchCase(id) {
    const changed = !caseDialog.open || activeCaseRowId !== id;
    activeCaseRowId = id;
    $('match-case-error').hidden = true;
    renderMatchCase();
    if (activeCaseRowId === null) return;
    if (!caseDialog.open) caseDialog.showModal();
    if (changed) $('match-case-scroll').scrollTop = 0;
    document.body.classList.add('case-dialog-open');
  }
  function renderMatches() {
    const rows = shownMatches(), pages = Math.max(1, Math.ceil(rows.length / pageSize)); matchPage = Math.min(matchPage, pages - 1); const details = diagnostics(); $('match-rows').replaceChildren();
    for (const row of rows.slice(matchPage * pageSize, (matchPage + 1) * pageSize)) {
      const id = String(row.source_row), detail = details.get(id), candidate = candidateOf(detail);
      const tr = make('tr'), person = make('td', 'match-person'), point = make('td', 'match-points'), when = make('td', 'answer-date'), cell = make('td', 'match-actions');
      tr.dataset.record = id;
      person.append(contact(row.name, row.emails || []));
      workflow.decorate(row, tr, person);
      point.append(paintMatchBadge(make('span'), row, detail));
      showDifference(row, detail, candidate, point);
      if ((detail?.candidates || []).length > 1) point.append(make('span', 'source-label match-multiple', number(detail.candidates.length) + '件の回答'));
      when.textContent = candidate ? date(candidate.timestamp) : '—';
      const button = make('button', 'button secondary row-toggle', '対応を開く');
      button.type = 'button'; button.setAttribute('aria-label', (row.name || 'この登録') + 'の対応を開く');
      button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-controls', 'match-case-dialog');
      button.addEventListener('click', () => openMatchCase(id));
      cell.append(button); tr.append(person, point, when, cell); $('match-rows').append(tr);
    }
    $('match-results').hidden = !matchResult;
    if (!rows.length) emptyRow($('match-rows'), matchResult ? '該当する登録がありません。検索条件や絞り込みを確認してください。' : '照合結果はCSVを選んだあとに表示されます。', 4);
    $('match-range').textContent = rows.length ? number(matchPage * pageSize + 1) + '–' + number(Math.min((matchPage + 1) * pageSize, rows.length)) + ' / ' + number(rows.length) + '件' : '0件';
    $('match-page').textContent = (matchPage + 1) + ' / ' + pages; $('match-prev').disabled = matchPage === 0; $('match-next').disabled = matchPage >= pages - 1;
    for (const button of document.querySelectorAll('[data-status]')) { const selected = button.dataset.status === matchStatus; button.setAttribute('aria-pressed', String(selected)); button.classList.toggle('active', selected); }
    renderMatchCase(details); controls();
  }
  async function loadMatch() {
    const sequence = ++matchSequence; closeMatchCase(false); matchResult = null; renderMatches();
    let result;
    try { result = await request('match'); }
    catch (error) {
      if (error?.message === 'LUの依頼者一覧CSVを読み込んでください。' && !storageStatus?.clientCount) return;
      throw error;
    } finally { if (sequence === matchSequence) await workflow.load(); }
    if (sequence !== matchSequence) return; matchResult = result; matchPage = 0;
    refreshMatchCounts();
    renderMatches();
  }
  async function loadView() { if (view === 'answers') await loadAnswers(); else if (view === 'stats') await loadStats(); else if (view === 'match') await loadMatch(); }
  const adminViews = ['form', 'answers', 'stats', 'match'];
  function initialView() {
    const remembered = window.history.state?.aceView;
    return adminViews.includes(remembered) ? remembered : location.hash === '#match' ? 'match' : 'form';
  }
  function setView(next) {
    if (next !== 'match' && caseDialog.open) closeMatchCase(false);
    view = next; $('error-banner').hidden = true;
    // Only the open section is remembered, never the login or case data.
    try { if (window.history.state?.aceView !== view) window.history.replaceState({ ...window.history.state, aceView: view }, ''); } catch (_) {}
    for (const name of adminViews) { const selected = name === view; $('panel-' + name).hidden = !selected; $('tab-' + name).setAttribute('aria-selected', String(selected)); $('tab-' + name).tabIndex = selected ? 0 : -1; }
    if (view === 'form') preview.refresh();
    return action(loadView);
  }
  async function readCsv(file) {
    if (!file || !/\.csv$/i.test(file.name) || file.size > 40 * 1024 * 1024) throw new Error('40MB以下のCSVファイルを選択してください。');
    const bytes = await file.arrayBuffer();
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, ''); }
    catch { return new TextDecoder('shift_jis', { fatal: true }).decode(bytes).replace(/^\uFEFF/, ''); }
  }
  async function importHistory(file) {
    const text = await readCsv(file); if (!window.YourAceMatching?.parseCsv) throw new Error('CSV読込機能を読み込めません。画面を開き直してください。');
    const parsed = window.YourAceMatching.parseCsv(text), headers = parsed.headers, rows = (parsed.records || []).map(item => item.cells);
    if (!headers?.length || !rows.length) throw new Error('見出しと回答行があるCSVを選択してください。');
    let imported = 0, duplicate = 0;
    try {
      for (let offset = 0; offset < rows.length; offset += 40) {
        $('history-progress').textContent = '取込中 ' + number(offset) + ' / ' + number(rows.length) + '件';
        const result = await request('importHistory', { headers, rows: rows.slice(offset, offset + 40) }); imported += Number(result.imported || 0); duplicate += Number(result.duplicate || 0);
      }
    } catch (error) {
      $('history-progress').textContent = '追加確認 ' + number(imported) + '件・取込済み確認 ' + number(duplicate) + '件。再取込で続けられます。';
      try { await refreshStatus(); await loadAnswers(); } catch {}
      throw error;
    }
    $('history-progress').textContent = '追加 ' + number(imported) + '件・取込済み ' + number(duplicate) + '件'; answerOffset = 0; await refreshStatus(); await loadAnswers(); notice('過去回答を取り込みました');
  }
  function exportMatches() {
    const details = diagnostics(), rows = shownMatches(); if (!rows.length) return;
    const neutral = value => { const text = String(value ?? ''); return /^[\s\u0000-\u001f]*[=+\-@]/.test(text) ? "'" + text : text; };
    const escape = value => '"' + neutral(value).replace(/"/g, '""') + '"';
    const data = [['照合結果', '管理番号', 'LU氏名', 'LUメール', '回答氏名', '回答メール', '回答日時', '理由'], ...rows.map(row => { const detail = details.get(String(row.source_row)), candidate = candidateOf(detail); return [matchLabel(row, detail), row.client_id, row.name, (row.emails || []).join(' / '), candidate?.name, candidate?.email, candidate?.timestamp, row.manual_confirmation ? '今回分として手動確認' : row.reason]; })];
    const blob = new Blob(['\uFEFF' + data.map(row => row.map(escape).join(',')).join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' }), url = URL.createObjectURL(blob), link = make('a'); link.href = url; link.download = '回答照合_' + new Date().toISOString().slice(0, 10) + '.csv'; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); notice('表示中の照合結果をCSV保存しました');
  }
  $('login-form').addEventListener('submit', async event => {
    event.preventDefault(); if (token || $('login-button').disabled) return; $('login-button').disabled = true; $('login-error').hidden = true;
    try { const result = await window.AceAPI.call('login', { password: $('password').value }); if (!result?.token) throw new Error('ログインできませんでした。'); token = result.token; $('password').value = ''; await refreshStatus(); $('login-panel').hidden = true; $('admin-app').hidden = false; document.body.dataset.authenticated = 'true'; const start = initialView(); $('tab-' + start).focus(); await setView(start); if (pendingAnswerId) { const id = pendingAnswerId; pendingAnswerId = ''; await action(() => openDetail(id)); } }
    catch (error) { token = null; $('login-error').textContent = error.message || 'ログインできませんでした。'; $('login-error').hidden = false; }
    finally { $('login-button').disabled = false; }
  });
  window.addEventListener('hashchange', () => { if (!location.hash.startsWith('#answer=')) return; try { const id = decodeURIComponent(location.hash.slice(8)); if (!id) return; if (token) action(() => openDetail(id)); else pendingAnswerId = id; } catch {} });
  $('logout-button').addEventListener('click', () => { const old = token; resetSession(); window.AceAPI.call('logout', { token: old }).catch(() => {}); });
  const tabs = [...document.querySelectorAll('#main-tabs [data-view]')];
  tabs.forEach((button, index) => { button.addEventListener('click', () => setView(button.dataset.view)); button.addEventListener('keydown', event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length; tabs[next].click(); tabs[next].focus(); }); });
  $('dismiss-error').addEventListener('click', () => { $('error-banner').hidden = true; });
  $('answers-search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { answerOffset = 0; action(loadAnswers); }, 250); });
  $('answers-prev').addEventListener('click', () => { answerOffset = Math.max(0, answerOffset - pageSize); action(loadAnswers); }); $('answers-next').addEventListener('click', () => { answerOffset += pageSize; action(loadAnswers); });
  $('match-case-close').addEventListener('click', () => closeMatchCase());
  caseDialog.addEventListener('close', () => { if (!caseDialog.open && activeCaseRowId !== null) clearMatchCase(); });
  $('detail-close').addEventListener('click', () => $('answer-dialog').close()); $('answer-dialog').addEventListener('click', event => { if (event.target === $('answer-dialog')) { const rect = $('answer-dialog').getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('answer-dialog').close(); } });
  $('history-warning-import').addEventListener('click', () => $('history-file').click());
  $('history-file').addEventListener('change', event => { const file = event.target.files[0]; if (file) action(() => importHistory(file)); event.target.value = ''; });
  $('match-import').addEventListener('click', () => $('clients-file').click());
  $('clients-file').addEventListener('change', event => { const file = event.target.files[0]; if (file) action(async () => {
    notice('照合中…');
    try { const text = await readCsv(file); await request('importClients', { text }); await refreshStatus(); await loadMatch(); }
    finally { renderMatches(); }
  }, 'LUを読み込み、照合しました'); event.target.value = ''; });
  for (const button of document.querySelectorAll('[data-status]')) button.addEventListener('click', () => { matchStatus = button.dataset.status; matchPage = 0; closeMatchCase(false); renderMatches(); });
  $('match-search').addEventListener('input', () => { matchPage = 0; closeMatchCase(false); renderMatches(); });
  $('match-sort').addEventListener('change', () => { matchPage = 0; closeMatchCase(false); renderMatches(); });
  $('match-prev').addEventListener('click', () => { matchPage--; closeMatchCase(false); renderMatches(); }); $('match-next').addEventListener('click', () => { matchPage++; closeMatchCase(false); renderMatches(); });
  $('match-export').addEventListener('click', exportMatches);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') $('history-menu').open = false; });
  document.addEventListener('click', event => { if (!$('history-menu').contains(event.target)) $('history-menu').open = false; });
  emptyRow($('answer-rows'), '保存済みの回答がありません'); renderMatches(); document.body.dataset.ready = 'true';
})();
