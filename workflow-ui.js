/* Case workflow is independent of identity matching. All external decisions are server-validated. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const make = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text != null) node.textContent = String(text); return node; };
  const defaults = () => ({ attorneys: [], officeStaff: [], lawyerRoomId: '', officeRoomId: '', senderAccountId: '', holidayKeywords: [], externalEnabled: false, autoDispatchEnabled: false, autoOfficeReturnEnabled: false, autoOfficeAccountId: '', autoScopeKey: '', autoStartAt: '', attendanceSource: 'calendar', shiftSpreadsheetId: '', shiftSheetPattern: '{YYYY}{M}' });
  const labels = { 'config.attorneys': '弁護士の割当順', 'config.attorneys.calendarId': '弁護士のカレンダーID', 'config.lawyerRoomId': '弁護士ルーム', 'config.officeStaff': '事務担当', 'config.officeRoomId': '事務ルーム', 'config.externalEnabled': '外部送信の有効化', 'host.tokenConfigured': 'Chatworkトークン', 'host.externalEnabled': 'この環境の送信許可', 'case.identityConfirmed': '本人照合', 'case.targetConfirmed': '今回の依頼確認', 'case.contentStatus': '回答内容の確認', 'case.responseIds': '今回分の回答選択', 'case.historicalCompleted': '過去の対応済みは送信対象外', 'availability.unknown': '当日の休み確認', 'availability.none': '対応可能な弁護士', 'case.lawyerResult': '弁護士の確認結果', 'case.reviewAccess': '弁護士の確認パスワードとHTTPSの確認画面', 'case.reviewDecision': '弁護士による確認結果とChatwork完了', 'case.originalLawyerRequest': '元の弁護士依頼', 'case.officeAccountId': '返却先の事務担当' };
  const taskField = kind => kind === 'lawyer' ? 'lawyerSent' : 'officeSent';
  const taskKinds = ['lawyer', 'office'];
  const taskLabel = kind => kind === 'lawyer' ? '弁護士への依頼' : '事務への返却';
  const correctionLabels = {withdraw:'取り下げを記録', reassign:'担当変更を記録', withdraw_reissue:'取り下げを記録して再依頼を準備', prepare:'再依頼先を設定'};
  const uncertainTask = item => taskKinds.some(kind => ['sending','unknown'].includes(item?.[taskField(kind)]));
  const correctionStatus = item => taskKinds.map(kind => item?.[taskField(kind)]).find(status => ['withdrawn','reissue_ready'].includes(status));
  function create({ request, action, notice, rerender, safeUrl, formatDate = value => String(value || '日時不明') }) {
    let state = { config: defaults(), cases: [], setupMissing: [], tokenConfigured: false }, available = false, preview = null, context = null;
    const selectedCycles = new Map();
    const correctionDialog = make('dialog', 'answer-dialog workflow-dialog workflow-correction-dialog');
    correctionDialog.id = 'workflow-correction-dialog'; correctionDialog.setAttribute('aria-label','誤送信を訂正');
    const recoveryDialog = make('dialog','answer-dialog workflow-dialog workflow-correction-dialog workflow-recovery-dialog');
    recoveryDialog.id='workflow-recovery-dialog'; recoveryDialog.setAttribute('aria-label','送信結果を確認');
    recoveryDialog.addEventListener('close',()=>{if(!recoveryDialog.open)recoveryDialog.replaceChildren();});
    document.body.append(correctionDialog,recoveryDialog);
    correctionDialog.addEventListener('close', () => { if (!correctionDialog.open) correctionDialog.replaceChildren(); });
    const recheckMessage = '新しい回答があります。今回分と内容を再確認してください';
    const needsRecheck = row => casesFor(row).some(item => item.needsRecheck === true);
    const contextNeedsRecheck = () => context && state.cases.some(item => item.caseKey === context.caseKey && item.needsRecheck === true);
    function showRecheck() { invalidatePreview(); $('workflow-preview-error').textContent = recheckMessage; $('workflow-preview-error').hidden = false; }
    const label = code => state.missingLabels?.[code] || labels[code] || code;
    const casesFor = row => (state.cases || []).filter(item => String(item.clientId) === String(row.client_id));
    function selectedCase(row) {
      const id = String(row.client_id), records = casesFor(row);
      if (selectedCycles.has(id)) return records.find(item => item.cycleKey === selectedCycles.get(id));
      if (row.manual_confirmation) return records.find(item => item.caseKey === row.manual_confirmation.caseKey);
      return records.length === 1 && records[0].automation?.source === 'matched' ? records[0] : undefined;
    }
    function nextStep(row, item) {
      if (!item) {
        if (row.status === 'candidate') return '今回は未回答です。回答が届いてから照合してください。';
        if (row.status === 'review') return '回答を開き、本人・今回の案件かを確認してください。';
        return '回答内容を確認し、必要に応じてこの案件の対応を記録してください。';
      }
      if (uncertainTask(item)) return '送信結果が未確定です。再送せず「送信結果を確認」を押してください。';
      if (item.needsRecheck) return recheckMessage;
      if (taskKinds.some(kind=>item[taskField(kind)]==='failed' && item.sendRecovery?.[kind]?.outcome==='not_created')) return '再送はまだしていません。内容と送信先を確認してから、必要な場合だけ送ってください。';
      if (item.officeStatus === 'done' || item.historicalCompleted) return 'この案件の対応は完了しています。';
      if (correctionStatus(item) === 'reissue_ready') return '再依頼の準備ができています。本人・今回分・回答内容を確認し、送信先を確認してください。';
      if (correctionStatus(item) === 'withdrawn') return '取り下げを記録済みです。再依頼が必要なら「誤送信を訂正」から準備してください。';
      if ([item.lawyerSent, item.officeSent].includes('failed')) return 'タスクを送れませんでした。送信先とChatworkの権限を確認してください。';
      if (item.officeSent === 'sent') return '事務処理が終わったら「事務後処理」を「処理済み」にして保存してください。';
      if (item.lawyerResult === 'returned') return '弁護士から差戻し。内容を確認し、事務へはまだ送らないでください。';
      if (item.lawyerSent === 'sent' && item.lawyerResult === 'approved') {
        if (!item.identityConfirmed || !item.targetConfirmed || item.contentStatus !== 'ready') return '事務へ返す前に、本人・今回分・回答内容を確認して記録してください。';
        return '返却先を選び、確認結果を保存してから「事務への返却内容を確認」を押してください。';
      }
      if (item.lawyerSent === 'sent') return '弁護士の確認結果が出たら、ここで結果を記録して保存してください。';
      if (item.automation?.source === 'matched') return '自動割当・タスク作成を待っています。';
      return '本人・今回分・回答内容を確認して保存すると、弁護士への依頼内容を確認できます。';
    }
    function replaceCase(item) { if (!item?.caseKey) return; state.cases = state.cases.filter(old => old.caseKey !== item.caseKey); state.cases.push(item); }
    function missingList(target, missing) { target.replaceChildren(...(missing || []).map(code => make('li', '', label(code)))); target.hidden = !(missing || []).length; }
    function personRow(person, attorney) {
      const row = make('div', 'workflow-person');
      for (const [field, title] of [['label', '表示名'], ['id', 'ChatworkアカウントID'], ...(attorney ? [['shiftName', 'シフト表の氏名'], ['calendarId', 'カレンダーID（カレンダー使用時）']] : [])]) {
        const box = make('label', '', title), input = make('input'); input.dataset.field = field; input.value = person?.[field] ?? ''; input.autocomplete = 'off'; input.required = field !== 'calendarId' && field !== 'shiftName'; if (field === 'id') { input.inputMode = 'numeric'; input.pattern = '[0-9]+'; } box.append(input); row.append(box);
      }
      const tools = make('div', 'workflow-person-actions');
      if (attorney) { const enabled = check('割当対象', person?.enabled !== false, 'workflow-attorney-enabled'); tools.append(enabled.label); }
      for (const [text, direction] of [['↑', -1], ['↓', 1], ['削除', 0]]) { const button = make('button', 'button quiet', text); button.type = 'button'; button.setAttribute('aria-label', direction ? (direction < 0 ? '割当順を上へ' : '割当順を下へ') : '担当を削除'); button.addEventListener('click', () => { if (!direction) row.remove(); else if (direction < 0 && row.previousElementSibling) row.parentNode.insertBefore(row, row.previousElementSibling); else if (direction > 0 && row.nextElementSibling) row.parentNode.insertBefore(row.nextElementSibling, row); }); tools.append(button); }
      row.append(tools);
      if (attorney) {
        const p=make('input','workflow-review-code');p.type='password';p.minLength=20;p.maxLength=120;p.autocomplete='new-password';
        p.placeholder=(state.reviewConfiguredIds||[]).includes(person?.id)?'設定済み／変更するときだけ入力':'20文字以上・他の担当者とは別に設定';
        const box=make('label','workflow-review-code-label','この弁護士の確認パスワード');box.append(p);row.append(box);
      }
      return row;
    }
    function check(text, checked, className, value) { const box = make('label', 'workflow-check'), input = make('input', className); input.type = 'checkbox'; input.checked = !!checked; if (value != null) input.value = value; box.append(input, document.createTextNode(text)); return { label: box, input }; }
    function updateOfficeChoices(wanted) {
      const pick=$('workflow-office-auto-account'), value=wanted??pick.value;
      const items=[...$('workflow-office-staff').querySelectorAll('.workflow-person')].map(r=>({id:r.querySelector('[data-field=id]').value.trim(),label:r.querySelector('[data-field=label]').value.trim()})).filter(v=>/^\d+$/.test(v.id));
      pick.replaceChildren(...[['','選択してください'],...items.map(x=>[x.id,x.label||x.id])].map(([id,label])=>{const o=make('option','',label);o.value=id;return o;}));
      pick.value=items.some(x=>x.id===value)?value:'';
      pick.required=$('workflow-office-auto').checked;
    }
    function renderSetup() {
      const config = { ...defaults(), ...state.config };
      if(!config.attorneys.length && state.setupHints){Object.assign(config,{attendanceSource:state.setupHints.attendanceSource,shiftSpreadsheetId:state.setupHints.shiftSpreadsheetId,shiftSheetPattern:state.setupHints.shiftSheetPattern});config.attorneys=(state.setupHints.attorneys||[]).map(a=>({...a,id:'',calendarId:'',enabled:true}));}
      $('workflow-attorneys').replaceChildren(...config.attorneys.map(item => personRow(item, true)));
      $('workflow-office-staff').replaceChildren(...config.officeStaff.map(item => personRow(item, false)));
      $('workflow-office-auto').checked=config.autoOfficeReturnEnabled===true;
      updateOfficeChoices(config.autoOfficeAccountId);
      for (const [id, key] of [['workflow-lawyer-room','lawyerRoomId'],['workflow-office-room','officeRoomId'],['workflow-sender-account','senderAccountId']]) $(id).value = config[key] ?? '';
      $('workflow-attendance-source').value=config.attendanceSource; $('workflow-shift-id').value=config.shiftSpreadsheetId; $('workflow-shift-pattern').value=config.shiftSheetPattern;
      $('workflow-holiday-keywords').value = config.holidayKeywords.join('\n'); $('workflow-external-enabled').checked = config.externalEnabled === true; $('workflow-chatwork-token').value = '';
      $('workflow-auto-enabled').checked = config.autoDispatchEnabled === true; $('workflow-auto-scope').value = config.autoScopeKey || ''; $('workflow-auto-scope').required = config.autoDispatchEnabled === true; $('workflow-auto-start').value = new Date((Date.parse(config.autoStartAt)||Date.now())+32400000).toISOString().slice(0,19); $('workflow-auto-start').required=config.autoDispatchEnabled===true;
      $('workflow-token-status').textContent = state.tokenConfigured ? '設定済み（値は表示しません）' : '未設定';
      $('workflow-setup-status').textContent = !available ? '状態未取得' : (state.setupMissing || []).length ? '設定待ち' : config.autoDispatchEnabled ? '弁護士へ自動で依頼' : '手動で依頼';
      $('workflow-host-status').textContent = !available ? '連携状態を取得できません。再照合してください。' : state.setupMissing?.includes('host.externalEnabled') ? 'この環境では外部送信が無効です。' : '';
      missingList($('workflow-config-missing'), state.setupMissing);
    }
    async function load() {
      try { const result = await request('workflowGet'); if (!result?.config || !Array.isArray(result.cases)) throw new Error('連携状態を取得できません。'); state = { ...result, config: { ...defaults(), ...result.config } }; available = true; if (contextNeedsRecheck()) showRecheck(); }
      catch (error) { if (['UNAUTHORIZED','AUTH_REQUIRED','SESSION_EXPIRED','INVALID_TOKEN'].includes(error.code)) throw error; available = false; }
      renderSetup();
    }
    function reset() { state = { config: defaults(), cases: [], setupMissing: [], tokenConfigured: false }; available = false; preview = null; context = null; selectedCycles.clear(); recoveryDialog.close(); correctionDialog.close(); $('workflow-dialog').close(); $('workflow-setup').open = false; $('workflow-attorneys').replaceChildren(); $('workflow-office-staff').replaceChildren(); $('workflow-config-form').reset(); $('workflow-chatwork-token').value = ''; $('workflow-config-missing').replaceChildren(); $('workflow-token-status').textContent = '未設定'; $('workflow-host-status').textContent = ''; $('workflow-setup-status').textContent = ''; $('workflow-preview-error').textContent = ''; $('workflow-preview-error').hidden = true; $('workflow-preview-body').textContent = ''; $('workflow-preview-missing').replaceChildren(); $('workflow-preview-assignee').textContent = '—'; $('workflow-preview-room').textContent = '—'; $('workflow-preview-due').textContent = '—'; $('workflow-preview-skipped').textContent = ''; $('workflow-available-attorneys').replaceChildren(); $('workflow-approval').checked = false; $('workflow-calendar-checked').checked = false; $('workflow-hide-task').checked = false; $('workflow-hide-office').checked = false; }
    function visible(row) { if (needsRecheck(row)) return true; const records = casesFor(row); return !($('workflow-hide-task').checked && records.length > 0 && records.every(item => item.lawyerSent === 'sent' && !correctionStatus(item) && !uncertainTask(item))) && !($('workflow-hide-office').checked && records.length > 0 && records.every(item => item.officeStatus === 'done' || item.historicalCompleted)); }
    function handlingRank(row) {
      const records = casesFor(row);
      if (needsRecheck(row) || !records.length || records.some(item => uncertainTask(item) || correctionStatus(item) && item.officeStatus !== 'done')) return 0;
      const done = item => item.officeStatus === 'done' || item.historicalCompleted;
      if (records.every(done)) return 2;
      return records.every(item => done(item) || item.lawyerSent === 'sent') ? 1 : 0;
    }
    function decorate(row, tr, cell) {
      const records = casesFor(row), rank = handlingRank(row);
      if (rank === 2) tr.classList.add('workflow-done');
      else if (rank === 1) tr.classList.add('workflow-task-sent');
      cell.append(make('span', rank === 2 ? 'handling-label handling-complete' : 'handling-label', rank === 2 ? '事務処理まで完了' : records.some(uncertainTask) ? '送信結果を確認' : needsRecheck(row) ? '要再確認' : records.some(item => correctionStatus(item) === 'reissue_ready') ? '再依頼を確認' : records.some(item => correctionStatus(item) === 'withdrawn') ? '取り下げを記録済み' : records.some(item => item.officeSent === 'sent' && item.officeStatus !== 'done') ? '事務に返却済み' : rank === 1 ? '弁護士に依頼済み' : '未対応'));
      if (!records.length) return;
      const summary = make('div', 'workflow-summary');
      for (const item of records) { const parts = [item.needsRecheck ? '新しい回答・要再確認' : item.historicalCompleted ? '過去の対応済み' : item.contentStatus === 'ready' ? '内容確認済み' : item.contentStatus === 'incomplete' ? '不足あり' : item.automation?.source === 'matched' ? '自動受付・内容未確認' : '内容未確認']; if (item.assignedAttorneyId) parts.push('担当：' + (state.config.attorneys.find(a => a.id === item.assignedAttorneyId)?.label || item.assignedAttorneyId)); if (item.lawyerSent === 'failed' || item.officeSent === 'failed') parts.push('送信失敗・要確認'); else if ([item.lawyerSent, item.officeSent].some(status => ['sending','unknown'].includes(status))) parts.push('送信結果を確認'); else if (!correctionStatus(item) && item.lawyerSent !== 'sent' && item.automation?.source === 'matched') parts.push('自動処理待ち'); if (item.lawyerReview?.chatworkStatus === 'done' && item.lawyerReview.result === 'pending') parts.push('Chatwork完了・判断待ち');
        if (item.lawyerReview?.result === 'approved' && item.lawyerReview.chatworkStatus !== 'done' && item.officeSent === 'not_sent') parts.push('Chatworkの完了待ち');
        if (item.lawyerResult === 'approved') parts.push('弁護士確認済み'); else if (item.lawyerResult === 'returned') parts.push('弁護士差戻し'); if (item.officeStatus === 'done' && rank !== 2) parts.push('事務処理済み'); summary.append(make('span', '', parts.join(' / '))); }
      cell.append(summary);
    }
    function field(text, node) { const box = make('label', 'workflow-field', text); box.append(node); return box; }
    function select(options, value, className) { const node = make('select', className); for (const [key, text] of options) { const option = make('option', '', text); option.value = key; node.append(option); } node.value = value; return node; }
    async function openCorrection(item) {
      const info = await request('workflowTaskInfo', {caseKey:item.caseKey});
      const head = make('header'), close = make('button','button quiet','閉じる');
      close.type = 'button'; close.addEventListener('click', () => correctionDialog.close());
      head.append(make('h2','','誤送信を訂正'), close);
      const form = make('form','workflow-correction-form');
      correctionDialog.replaceChildren(head, form);
      const tasks = info.tasks || [];
      if (!tasks.length) {
        form.append(make('p','','訂正できる送信済みタスクがありません。'));
        correctionDialog.showModal(); return;
      }
      const target = select(tasks.map(task => [task.kind,taskLabel(task.kind)]), tasks.find(task => !task.block)?.kind || tasks[0].kind, 'workflow-correction-kind');
      const controls = make('div','workflow-correction-controls');
      form.append(field('対象タスク',target), controls);
      let mode, account, reason, ack, commit, error, task;
      function render() {
        task = tasks.find(candidate => candidate.kind === target.value);
        const refs = make('div','workflow-task-ref'), person = (task.kind === 'lawyer' ? state.config.attorneys : state.config.officeStaff).find(a => a.id === task.accountId);
        refs.append(make('strong','','元のタスク'), make('span','','タスクID：' + task.taskIds.join('、') + '　担当：' + (person?.label || task.accountId)));
        if (/^[1-9][0-9]{0,19}$/.test(task.roomId)) {
          const link = make('a','button quiet','Chatworkの送信先を開く ↗');
          link.href = 'https://www.chatwork.com/#!rid' + task.roomId; link.target = '_blank'; link.rel = 'noopener noreferrer'; refs.append(link);
        }
        controls.replaceChildren(refs);
        if (task.withdrawn) controls.append(make('p','','元のタスクは取り下げを記録済みです。' + (task.nextAccountId ? ' 再依頼先：' + task.nextAccountId : '')));
        if (task.history?.length || task.archived?.length) {
          const history = make('details','workflow-correction-history');
          history.append(make('summary','','訂正履歴'));
          for (const entry of [...(task.history || []), ...(task.archived || [])]) {
            history.append(make('p','',correctionLabels[entry.action] + '：' + entry.reason + (entry.accountId ? '（担当ID：' + entry.accountId + '）' : '') + (entry.taskIds ? '｜元タスクID：' + entry.taskIds.join('、') : '') + '｜' + new Date(entry.at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})));
          }
          controls.append(history);
        }
        if (task.block) { controls.append(make('p','',task.block)); return; }
        const options = task.withdrawn ? [['prepare','再依頼先を設定する']] : [['withdraw','取り下げのみ'],['reassign','Chatworkで担当者を変更済み'],['withdraw_reissue','取り下げて、再依頼する']];
        mode = select(options,options[0][0],'workflow-correction-mode');
        account = select([['','選択してください']], '', 'workflow-correction-account'); account.required = true;
        const accountField = field('訂正後の担当者',account);
        reason = make('textarea','workflow-correction-reason'); reason.maxLength = 500; reason.required = true; reason.rows = 2;
        ack = check('',false,'workflow-correction-ack');
        commit = make('button','button primary workflow-correction-commit'); commit.type = 'submit';
        error = make('p','error-text'); error.setAttribute('role','alert'); error.hidden = true;
        const hint = make('p','workflow-correction-hint');
        function gate() { commit.disabled = !ack.input.checked || !reason.value.trim() || (!account.disabled && !account.value); }
        function update() {
          const sameTask = mode.value === 'reassign', prepare = mode.value === 'prepare';
          const people = (task.kind === 'lawyer' ? state.config.attorneys.filter(person => person.enabled !== false) : state.config.officeStaff).filter(person => !sameTask || person.id !== task.accountId);
          account.replaceChildren(...select([['','選択してください'], ...people.map(person => [person.id, person.label + '（' + person.id + '）'])],'').options);
          account.value = prepare && people.some(person => person.id === task.nextAccountId) ? task.nextAccountId : '';
          account.disabled = mode.value === 'withdraw'; accountField.hidden = account.disabled;
          hint.textContent = prepare ? 'ここでは再依頼先を決めるだけです。送信は次の確認画面で行います。' : '先にChatworkで元のタスクを訂正してください。この画面では結果を記録するだけです。';
          ack.label.lastChild.textContent = sameTask ? 'Chatworkで元のタスクの担当者を変更しました' : 'Chatworkで元のタスクを取り下げました';
          ack.input.checked = false; commit.textContent = correctionLabels[mode.value]; error.hidden = true; gate();
        }
        mode.addEventListener('change',update); ack.input.addEventListener('change',gate); reason.addEventListener('input',gate); account.addEventListener('change',gate);
        controls.append(hint, field('行った訂正',mode), accountField, field('訂正理由',reason), ack.label, error, commit);
        update();
      }
      target.addEventListener('change',render);
      form.addEventListener('submit',event => {
        event.preventDefault();
        if (!commit || commit.disabled || task.block) return;
        action(async () => {
          commit.disabled = true; error.hidden = true;
          try {
            const result = await request('workflowCorrectTask',{caseKey:item.caseKey,kind:task.kind,sendId:task.sendId,expectedVersion:info.version,action:mode.value,accountId:account.disabled ? '' : account.value,reason:reason.value.trim(),confirmed:ack.input.checked});
            replaceCase({...result.case,needsRecheck:item.needsRecheck});
            correctionDialog.close(); rerender();
            notice(['prepare','withdraw_reissue'].includes(mode.value) ? '再依頼を準備しました。まだ送信していません。' : '訂正を記録しました。新しいタスクは送信していません。');
          } catch (e) {
            error.textContent = e.message || '訂正の記録に失敗しました。開き直して確認してください。';
            error.hidden = false; commit.disabled = false;
          }
        });
      });
      render(); correctionDialog.showModal();
    }
    async function openRecovery(item) {
      const info=await request('workflowPendingInfo',{caseKey:item.caseKey});
      const header=make('header'), close=make('button','button quiet','閉じる'); close.type='button';
      close.addEventListener('click',()=>recoveryDialog.close());
      header.append(make('h2','','送信結果を確認'),close);
      const form=make('div','workflow-correction-form'); recoveryDialog.replaceChildren(header,form);
      if (!info.pending?.length) {
        form.append(make('p','','確認が必要な送信はありません。画面を更新して対応状況を確認してください。'));
        recoveryDialog.showModal();return;
      }
      const selectTask=select(info.pending.map(i=>[i.kind,taskLabel(i.kind)]),info.pending[0].kind,'workflow-recovery-kind');
      const content=make('div','workflow-correction-controls');
      if(info.pending.length>1)form.append(field('確認するタスク',selectTask));
      form.append(content);
      const button=(text,style,cls,fn)=>{const b=make('button','button '+style+' '+cls,text);b.type='button';b.addEventListener('click',()=>action(fn));return b;};
      function render(){
        const task=info.pending.find(i=>i.kind===selectTask.value);
        const people=task.kind==='lawyer'?state.config.attorneys:state.config.officeStaff;
        const person=people.find(p=>p.id===task.accountId);
        const ref=make('div','workflow-task-ref');
        ref.append(make('strong','',taskLabel(task.kind)),
          make('span','',(person?.label||'担当ID '+task.accountId)+' ・ ルーム '+task.roomId),
          make('span','',new Date(task.attemptedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})+'（送信操作）'));
        if(task.reference)ref.append(make('span','', '送信照会番号：'+task.reference));
        if(/^[1-9][0-9]{0,19}$/.test(task.roomId)){
          const link=make('a','button quiet','Chatworkの送信先を開く ↗'); link.href='https://www.chatwork.com/#!rid'+task.roomId;link.target='_blank';link.rel='noopener noreferrer';ref.append(link);
        }
        const body=make('details','workflow-correction-history');
        body.append(make('summary','','送信した本文を確認'),make('pre','workflow-preview-body',task.body));
        content.replaceChildren(ref,body);
        const elapsed=seconds=>Math.max(1,Math.ceil(seconds/60));
        if(task.inProgress){
          content.append(make('p','','まだ送信処理中の可能性があります。約'+elapsed(task.waitSeconds)+'分後に開き直してください。'));return;
        }
        const status=make('p','workflow-recovery-status');status.setAttribute('role','status');
        status.textContent='Chatworkを確認して結果を記録します。この操作でタスクは送信されません。';
        const known=make('details','workflow-correction-history workflow-recovery-advanced');
        known.append(make('summary','','タスクIDが分かる場合'));
        const id=make('input','workflow-recovery-task-id');id.inputMode='numeric';id.maxLength=20;id.autocomplete='off';id.placeholder='半角数字';
        const empty=make('details','workflow-correction-history workflow-recovery-advanced');empty.hidden=true;
        empty.append(make('summary','','タスクが作られていなかった場合'));
        const ack=check('元のルームと担当者を確認し、タスクが作られていなかったことを確認しました',false,'workflow-recovery-ack');
        const reason=make('textarea','workflow-recovery-reason');reason.rows=2;reason.maxLength=500;reason.placeholder='例：送信先の担当者に確認済み';
        const mark=button('未作成を記録','secondary','workflow-recovery-absent',()=>run('not_created',{confirmed:ack.input.checked,reason:reason.value.trim()}));
        const gate=()=>{mark.disabled=!ack.input.checked||!reason.value.trim();};
        ack.input.addEventListener('change',gate);reason.addEventListener('input',gate);gate();
        empty.append(make('p','','一覧で見つからないだけでは未作成とは限りません。担当変更や削除があった場合はここで記録しないでください。'),ack.label,field('確認メモ',reason),mark);
        async function run(actionName,extra={}){
          if(actionName==='find_id'&&!/^[1-9][0-9]{0,19}$/.test(extra.taskId)){status.textContent='タスクIDを半角数字で入力してください。';return;}
          empty.hidden=true;status.textContent='Chatworkを確認中…';
          let result;
          try{result=await request('workflowReconcileSend',{caseKey:item.caseKey,kind:task.kind,sendId:task.sendId,expectedVersion:info.version,action:actionName,...extra});}
          catch(error){
            if(['UNAUTHORIZED','AUTH_REQUIRED','SESSION_EXPIRED','INVALID_TOKEN'].includes(error.code))throw error;
            status.textContent=error.message||'確認できませんでした。送信状態は変更していません。';return;
          }
          if(result.case){
            replaceCase(result.case);recoveryDialog.close();rerender();
            notice(result.status==='recorded_sent'?'既存タスクを送信済みにしました。新しいタスクは送っていません。':'未作成を記録しました。必要なら送信内容を確認してから再送してください。');
          } else if(result.status==='legacy_match'){
            id.value=result.taskId;known.open=true;
            status.textContent='一致する候補が1件あります。タスクIDと本文を確認し、下のボタンで記録してください。';
          } else if(result.status==='found_pending'){
            status.textContent='一致するタスクが見つかりました。未作成にはせず「Chatworkで確認」を押してください。';
          } else if(result.status==='not_found'){
            status.textContent=actionName==='find_id'?'指定したタスクを確認できませんでした。送信状態は変更していません。':'一致するタスクは一覧で見つかりませんでした。まだ再送しないでください。';
            if(actionName==='check'){
              if(!task.waitSeconds)empty.hidden=false;
              else status.textContent+=' 未作成を記録する場合は約'+elapsed(task.waitSeconds)+'分後に開き直してください。';
            }
          } else status.textContent=result.status==='ambiguous'?'同じ内容の候補が複数あるか、担当者・本文が異なります。状態は変更していません。':'一覧だけでは確認できません。分かる場合はタスクIDで照合してください。';
        }
        known.append(field('ChatworkのタスクID',id),button('タスクIDで照合','secondary','workflow-recovery-id',()=>run('find_id',{taskId:id.value.trim()})));
        content.append(status,button('Chatworkで確認','primary','workflow-recovery-check',()=>run('check')),known,empty);
      }
      selectTask.addEventListener('change',render);render();recoveryDialog.showModal();
    }
    function caseStage(number, label, state, open) {
      const section = make('details', 'workflow-stage');
      section.dataset.stage = number; section.open = open;
      const summary = make('summary', 'workflow-stage-heading');
      summary.append(make('span', 'workflow-stage-number', number), make('strong', '', label), make('span', 'workflow-stage-state', state));
      const grid = make('div', 'workflow-case-grid workflow-stage-grid');
      section.append(summary, grid);
      return {section, grid};
    }
    function editor(row, candidates) {
      const records = casesFor(row), item = selectedCase(row), form = make('form', 'workflow-case');
      if (needsRecheck(row)) form.append(make('p', 'error-text workflow-recheck', recheckMessage));
      else if (item) form.append(make('p', 'workflow-next', nextStep(row, item)));
      const current = !item || item.needsRecheck || item.contentStatus !== 'ready' || item.lawyerResult === 'returned' ? '01' :
        item.lawyerResult === 'approved' || item.officeStatus === 'done' ? '03' : item.lawyerSent === 'sent' ? '02' : '01';
      const responseStage = caseStage('01', '回答確認', item?.needsRecheck ? '要再確認' : item?.contentStatus === 'ready' ? '確認済み' : item?.contentStatus === 'incomplete' ? '不足あり' : '未確認', current === '01');
      const lawyerStage = caseStage('02', '弁護士確認', item?.lawyerResult === 'approved' ? '確認済み' : item?.lawyerResult === 'returned' ? '差戻し' : item?.lawyerSent === 'sent' ? '依頼済み' : '未確認', current === '02');
      const officeStage = caseStage('03', '事務処理', item?.officeStatus === 'done' || item?.historicalCompleted ? '処理済み' : item?.officeSent === 'sent' ? '返却済み' : '未完了', current === '03');
      if (records.length) { const existing = select([['','新しい依頼を登録'], ...records.map(saved => [saved.cycleKey, saved.cycleKey + (saved.historicalCompleted ? '（過去の対応済み）' : '')])], item?.cycleKey || '', 'workflow-existing'); existing.setAttribute('aria-label', '保存済みの依頼'); existing.addEventListener('change', () => { selectedCycles.set(String(row.client_id), existing.value); rerender(); }); form.append(field('依頼の選択', existing)); }
      const grid = responseStage.grid, fromManualMatch = !!row.manual_confirmation && item?.caseKey === row.manual_confirmation.caseKey, cycle = make('input', 'workflow-cycle'); cycle.value = item?.cycleKey || ''; cycle.required = true; cycle.maxLength = 120; cycle.autocomplete = 'off'; cycle.placeholder = '今回の依頼を識別するキー'; if (item) cycle.readOnly = true; const cycleField = field('依頼キー', cycle); cycleField.hidden = fromManualMatch; grid.append(cycleField);
      const identity = check('本人・同一案件を人が確認済み', item?.identityConfirmed && !item?.needsRecheck, 'workflow-identity'), target = check('選んだ回答が今回の依頼分と確認済み', item?.targetConfirmed && !item?.needsRecheck, 'workflow-target'); 
      const content = select([['unchecked','未確認'],['incomplete','不足あり'],['ready','内容が揃っている']], item?.needsRecheck ? 'unchecked' : item?.contentStatus || 'unchecked', 'workflow-content'); 
      const answers = make('fieldset', 'workflow-response-options'); answers.append(make('legend', '', '今回分の回答'));
      const seen = new Set(); for (const candidate of candidates || []) { const id = candidate.response_id; if (!id || seen.has(id)) continue; seen.add(id); const option = check(formatDate(candidate.timestamp) + ' ｜ ' + (candidate.name || '氏名なし'), item?.responseIds?.includes(id), 'workflow-response', id); answers.append(option.label); }
      if (!seen.size) answers.append(make('p', 'source-label', '選択できる保存済み回答がありません。'));
      if (fromManualMatch) { answers.hidden = true; identity.label.hidden = true; target.label.hidden = true; }
      grid.append(answers, identity.label, target.label, field('事務の内容確認', content));
      const lawyer = select([['pending','未確認'],['approved','確認済み'],['returned','差戻し']], item?.lawyerResult || 'pending', 'workflow-lawyer-result'), office = select([['pending','未完了'],['done','処理済み']], item?.officeStatus || 'pending', 'workflow-office-status');
      lawyerStage.grid.append(field('弁護士の確認結果', lawyer));
      const account = select([['','選択してください'], ...state.config.officeStaff.map(person => [String(person.id), person.label + '（' + person.id + '）'])], item?.officeAccountId ? String(item.officeAccountId) : '', 'workflow-office-account'); officeStage.grid.append(field('返却先の事務担当', account), field('事務後処理', office));
      const historical = check('過去の対応済み（タスクを送信しない）', item?.historicalCompleted && !item?.needsRecheck, 'workflow-historical'); officeStage.grid.append(historical.label);
      const note = make('textarea', 'workflow-note'); note.rows = 2; note.maxLength = 4000; note.value = item?.note || ''; const noteField = field('確認メモ（任意）', note); noteField.classList.add('workflow-stage-wide'); grid.append(noteField);
      form.append(responseStage.section, lawyerStage.section, officeStage.section);
      const buttons = make('div', 'workflow-case-actions'), save = make('button', 'button primary workflow-save', '対応を保存'); save.type = 'submit'; buttons.append(save);
      let dirty = false;
      const ready = () => available && !!item && !dirty && !item.needsRecheck && !item.historicalCompleted && item.identityConfirmed === true && item.targetConfirmed === true && item.contentStatus === 'ready' && item.responseIds?.length > 0;
      for (const [kind, text] of [['lawyer','弁護士への依頼内容を確認'],['office','事務への返却内容を確認']]) { const status = item?.[taskField(kind)], button = make('button', 'button secondary', status === 'reissue_ready' ? (kind === 'lawyer' ? '弁護士' : '事務') + 'への再依頼を確認' : text); button.type = 'button'; button.dataset.workflowPreview = kind; button.disabled = !ready() || ['sent','sending','unknown','withdrawn'].includes(status) || (kind === 'office' && item?.lawyerResult !== 'approved'); button.addEventListener('click', () => action(() => openPreview(item, kind))); buttons.append(button); }
      if (available && uncertainTask(item)) {
        const recovery=make('button','button secondary','送信結果を確認');recovery.type='button';recovery.dataset.workflowRecovery='';
        recovery.addEventListener('click',()=>action(()=>openRecovery(item)));buttons.append(recovery);
      }
      if (available && item && !item.historicalCompleted && taskKinds.some(kind => ['sent','withdrawn','reissue_ready','failed'].includes(item[taskField(kind)]))) {
        const correct = make('button','button quiet','誤送信を訂正'); correct.type = 'button'; correct.dataset.workflowCorrection = '';
        correct.addEventListener('click', () => action(() => openCorrection(item))); buttons.append(correct);
      }
      form.addEventListener('invalid', event => { const stage=event.target.closest('.workflow-stage'); if (stage) stage.open=true; }, true);
      form.addEventListener('input', () => { dirty = true; for (const button of buttons.querySelectorAll('[data-workflow-preview]')) button.disabled = true; });
      form.addEventListener('change', () => { dirty = true; for (const button of buttons.querySelectorAll('[data-workflow-preview]')) button.disabled = true; });
      form.addEventListener('submit', event => { event.preventDefault(); action(async () => { const responseIds = [...form.querySelectorAll('.workflow-response:checked')].map(input => input.value); const payload = { clientId: row.client_id, cycleKey: cycle.value.trim(), responseIds, identityConfirmed: identity.input.checked, targetConfirmed: target.input.checked, contentStatus: content.value, note: note.value, officeAccountId: account.value, lawyerResult: lawyer.value, officeStatus: office.value, historicalCompleted: historical.input.checked }; const result = await request('workflowSaveCase', payload); replaceCase(result.case); selectedCycles.set(String(row.client_id), payload.cycleKey); rerender(); notice('対応状態を保存しました'); }); });
      if (item?.historicalCompleted) form.append(make('p', 'source-label', '過去の対応済みはタスクを送信しません。'));
      form.append(buttons); return form;
    }
    function manualAvailability() { return context?.kind === 'lawyer' && $('workflow-calendar-checked').checked ? { manualCalendarChecked: true, availableAttorneyIds: [...$('workflow-available-attorneys').querySelectorAll('input:checked')].map(input => input.value) } : {}; }
    function sendControls() { $('workflow-send').disabled = contextNeedsRecheck() || !preview?.draft?.id || !preview?.draft?.hash || !preview.eligible || (preview.missing || []).length > 0 || state.config.externalEnabled !== true || !state.tokenConfigured || !$('workflow-approval').checked; }
    function invalidatePreview() { preview = null; $('workflow-approval').checked = false; sendControls(); }
    function renderPreview(result) {
      preview = result; const draft = result.draft, people = context.kind === 'lawyer' ? state.config.attorneys : state.config.officeStaff, person = people.find(item => String(item.id) === String(draft?.accountId));
      $('workflow-preview-title').textContent = draft?.body?.startsWith('【再依頼】') ? taskLabel(context.kind) + '・再依頼の送信確認' : context.kind === 'lawyer' ? '弁護士タスクの送信確認' : '事務返却タスクの送信確認'; $('workflow-preview-assignee').textContent = draft?.accountId ? (person?.label || '担当') + '（' + draft.accountId + '）' : '未確定'; $('workflow-preview-room').textContent = draft?.roomId ? String(draft.roomId) : '未設定';
      const due = draft?.limit ? new Date(Number(draft.limit) * 1000) : null; $('workflow-preview-due').textContent = due && Number.isFinite(due.getTime()) ? new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(due) + '（当日・日本時間）' : '未確定（日本時間）';
      $('workflow-preview-body').textContent = draft?.body || '送信案を作成できません。'; missingList($('workflow-preview-missing'), result.missing);
      $('workflow-preview-skipped').textContent = (result.skipped || []).length ? '今回の割当対象外：' + result.skipped.map(item => state.config.attorneys.find(person => String(person.id) === String(item.attorneyId))?.label || item.attorneyId).join('、') : ''; $('workflow-approval').checked = false; sendControls();
    }
    async function updatePreview() { if (!context) return; if (contextNeedsRecheck()) { showRecheck(); return; } invalidatePreview(); $('workflow-preview-error').textContent = ''; $('workflow-preview-error').hidden = true; try { const result = await request('workflowPreview', { caseKey: context.caseKey, kind: context.kind, ...manualAvailability() }); renderPreview(result); } catch (error) { $('workflow-preview-error').textContent = error.message || '送信案を取得できません。'; $('workflow-preview-error').hidden = false; throw error; } }
    async function openPreview(item, kind) {
      context = { caseKey: item.caseKey, kind }; invalidatePreview(); $('workflow-calendar-checked').checked = false; $('workflow-availability').hidden = kind !== 'lawyer';
      $('workflow-calendar-mode').textContent = state.calendarCapability === 'google' ? (state.config.attendanceSource==='shift'?'共有シフト表で判定します。半休・不明は自動割当を止めます。':'Googleカレンダーで判定します。人による確認を選ぶと、その結果を優先します。') : '本日（日本時間）のカレンダーを確認し、対応可能な弁護士だけを選択してください。';
      $('workflow-available-attorneys').replaceChildren(...state.config.attorneys.filter(person => person.enabled !== false).map(person => check(person.label + '：本日対応可能', false, '', String(person.id)).label));
      await updatePreview(); $('workflow-dialog').showModal();
    }
    const roomId=value=>{const match=String(value).trim().match(/^(?:https:\/\/(?:www\.)?chatwork\.com\/#!rid)?([1-9][0-9]{0,19})(?:-[0-9]+)?$/);if(!match)throw new Error('ChatworkのルームURLまたはIDを入力してください。');return match[1];};
    $('workflow-resolve-members').addEventListener('click',()=>action(async()=>{const secret=$('workflow-chatwork-token').value;$('workflow-chatwork-token').value='';const result=await request('workflowResolveMembers',{lawyerRoomId:roomId($('workflow-lawyer-room').value),officeRoomId:$('workflow-office-room').value.trim()?roomId($('workflow-office-room').value):'',...(secret?{chatworkToken:secret}:{})});$('workflow-attorneys').replaceChildren(...result.attorneys.map(a=>personRow(a,true)));if(result.officeMembers?.length)$('workflow-office-staff').replaceChildren(...result.officeMembers.map(a=>personRow(a,false)));$('workflow-sender-account').value=result.senderAccountId;$('workflow-token-status').textContent='設定済み（値は表示しません）';$('workflow-resolve-status').textContent=result.unresolved.length?'部屋に未参加または同名のため未確定：'+result.unresolved.join('、'):'担当者を取得しました。この操作ではタスクは送信していません。';}));
    $('workflow-add-attorney').addEventListener('click', () => $('workflow-attorneys').append(personRow({}, true)));
    $('workflow-add-office').addEventListener('click', () => $('workflow-office-staff').append(personRow({}, false)));
    $('workflow-config-form').addEventListener('submit', event => { event.preventDefault(); action(async () => {
      const people = (id, attorney) => [...$(id).querySelectorAll('.workflow-person')].map(row => { const person = {}; for (const input of row.querySelectorAll('[data-field]')) person[input.dataset.field] = input.value.trim(); if (attorney) person.enabled = row.querySelector('.workflow-attorney-enabled').checked; return person; });
      const config = { attorneys: people('workflow-attorneys', true), officeStaff: people('workflow-office-staff', false), lawyerRoomId: $('workflow-lawyer-room').value.trim()?roomId($('workflow-lawyer-room').value):'', officeRoomId: $('workflow-office-room').value.trim()?roomId($('workflow-office-room').value):'', senderAccountId: $('workflow-sender-account').value.trim(), holidayKeywords: $('workflow-holiday-keywords').value.split(/\r?\n/).map(text => text.trim()).filter(Boolean), externalEnabled: $('workflow-external-enabled').checked, autoDispatchEnabled: $('workflow-auto-enabled').checked, autoScopeKey: $('workflow-auto-scope').value.trim(), autoStartAt:$('workflow-auto-start').value?new Date($('workflow-auto-start').value+'+09:00').toISOString():'',attendanceSource:$('workflow-attendance-source').value,shiftSpreadsheetId:$('workflow-shift-id').value.trim(),shiftSheetPattern:$('workflow-shift-pattern').value.trim(),autoOfficeReturnEnabled:$('workflow-office-auto').checked,autoOfficeAccountId:$('workflow-office-auto-account').value };
      const chatworkToken=$('workflow-chatwork-token').value; $('workflow-chatwork-token').value='';
      const reviewCodes=[...$('workflow-attorneys').querySelectorAll('.workflow-person')].map(row=>{const input=row.querySelector('.workflow-review-code'),code=input.value;input.value='';return {accountId:row.querySelector('[data-field=id]').value.trim(),code};}).filter(x=>x.code);
      const result=await request('workflowConfigure',{config,...(reviewCodes.length?{reviewCodes}:{}),...(chatworkToken?{chatworkToken}:{})}); state = { ...state, ...result, config: { ...defaults(), ...result.config } }; available = true; await load(); rerender(); notice('連携設定を保存しました');
    }); });
    $('workflow-office-auto').addEventListener('change',()=>updateOfficeChoices());
    $('workflow-office-staff').addEventListener('input',()=>updateOfficeChoices());
    $('workflow-office-staff').addEventListener('click',()=>updateOfficeChoices());
    for (const id of ['workflow-hide-task','workflow-hide-office']) $(id).addEventListener('change', rerender);
    $('workflow-auto-enabled').addEventListener('change', () => { $('workflow-auto-scope').required = $('workflow-auto-enabled').checked; $('workflow-auto-start').required=$('workflow-auto-enabled').checked; });
    $('workflow-calendar-checked').addEventListener('change', invalidatePreview); $('workflow-available-attorneys').addEventListener('change', invalidatePreview); $('workflow-approval').addEventListener('change', sendControls);
    $('workflow-preview-refresh').addEventListener('click', () => action(updatePreview));
    $('workflow-preview-close').addEventListener('click', () => { $('workflow-dialog').close(); invalidatePreview(); context = null; });
    $('workflow-dialog').addEventListener('cancel', () => { invalidatePreview(); context = null; });
    $('workflow-send').addEventListener('click', () => { if ($('workflow-send').disabled || !preview?.draft) return; action(async () => { if (!window.confirm('表示した担当・ルーム・本文・期限でChatworkへタスクを送信します。送信しますか？')) return; const draft = preview.draft, kind = context.kind, availability = manualAvailability(); invalidatePreview(); let result; try { result = await request('workflowSend', { draftId: draft.id, approvedHash: draft.hash, confirmed: true, ...availability }); } catch (error) { $('workflow-preview-error').textContent = error.message || '送信結果を確認してください。'; $('workflow-preview-error').hidden = false; throw error; } const sent = result.case?.[kind === 'lawyer' ? 'lawyerSent' : 'officeSent'];
      replaceCase(result.case); $('workflow-dialog').close(); context = null; rerender();
      if (sent === 'sent') notice('Chatworkにタスクを作成しました');
      else throw new Error(sent === 'failed' ? 'Chatworkにタスクを作成できませんでした。送信先と権限を確認してください。' : 'Chatworkの送信結果を確認できませんでした。再送はせず、送信先で結果を確認してください。'); }); });
    return Object.freeze({ load, reset, visible, decorate, handlingRank, editor, selectManualCase: id => selectedCycles.delete(String(id)), automaticEnabled: () => available && state.config.autoDispatchEnabled === true && state.externalEnabled === true });
  }
  window.AceWorkflow = Object.freeze({ create });
})();
