// Demo CRM (a mock of Salesforce) for the GeoComply deal platform case.
// Everything the deal does is saved to Supabase. The model runs on the server (the "predict" Edge Function)
// and writes its results to the database, which the platform site reads live.

const DEAL_ID = 'NV-083';
const NOTE = 'Wants to know if location can be checked without ever showing users a permission prompt.';
const TAGS = {
  prompt: 'Permission prompt', oneapi: 'One API', browser: 'Locked browser', security: 'Security review',
  price: 'Price against IP-only checks', bots: 'Not seen as anti-bot', selfserve: 'Wants self-serve', budget: 'No clear budget owner',
  legal: 'Legal review', procurement: 'Approved vendor list', partial: 'Staging partials', dates: 'UK date format'
};
// What a rep sees for each sticking point (written from the case files)
const SALES = {
  prompt: { from: 'Stawks.io:', text: 'our engineers tuned it with theirs for a week. Users asked for their location fell from 22% to 9%.', next: 'Nothing buyer-ready to send yet. Marketing has this as their biggest gap.', btn: 'engineer', msg: 'Ama Mensah', fix: true },
  partial: { from: 'Marigold Gaming:', text: 'test profiles with typos failed in staging. The preset partial-result profile works.', next: 'Tell them to use the preset test profile before testing starts.', btn: 'copy', msg: 'Andriy Koval', fix: true },
  dates: { from: 'Ashgrove Bet:', text: 'UK dates of birth were read as US dates. The fix is in the integration guide.', next: 'Confirm the date format at setup.', msg: 'Andriy Koval', fix: true },
  oneapi: { from: 'Delivery platform:', text: 'went quiet for 6 weeks after we sent four separate integration docs. No fix yet.', next: 'Ask engineering for one combined guide before you send anything.', msg: 'Maya Chen' },
  legal: { from: 'Dating app:', text: 'still waiting on their legal team and ours, 318 days in.', next: 'Get both legal teams talking before you send pricing.' },
  browser: { from: 'Exam proctoring:', text: 'their app runs in a locked-down browser. About 6 weeks of engineering.', next: 'Ask early which browser their users are on.' },
  security: { from: 'Neobank:', text: 'vendor risk questionnaire is on round 4.', next: 'Send the security pack in the first week.' },
  budget: { from: 'Telehealth platform:', text: 'compliance and product each thought the other was paying.', next: 'Ask who signs off on the budget on the next call.' },
  procurement: { from: 'Licence renewals:', text: 'vendors must be on a public approved list first.', next: 'Check if we need to be on an approved vendor list.' },
  price: { from: 'Sports broadcaster:', text: 'chose an IP database at a tenth of our price.', next: 'Show what IP-only checks miss before pricing comes up.' },
  bots: { from: 'Ticketing company:', text: 'lost to a bot-mitigation vendor.', next: 'Explain how location stops bots early in the deal.' },
  selfserve: { from: 'Donation platform:', text: 'wanted to pay by card the same day.', next: 'Flag early that there’s no self-serve plan.' }
};
const OTHER_DEALS = [
  ['Delivery platform', 'Delivery platform, US + Canada', 'Solution design', 'Lena Ortiz'],
  ['Prediction market', 'Event-contract platform, US', 'Pricing', 'Marcus Reid'],
  ['Licence renewals', 'Provincial online licence renewals, Canada', 'Discovery', 'Marcus Reid'],
  ['Exam proctoring', 'Online exam proctoring provider, global', 'Technical scoping', 'Marcus Reid'],
  ['Dating app', 'Dating app, US, ~2M MAU', 'Technical scoping', 'Lena Ortiz'],
  ['Cross-border payments', 'Cross-border payments company, UK + EU', 'Discovery', 'Sam Patel'],
  ['Donation platform', 'Online donation platform, US + UK', 'Proposal', 'Lena Ortiz']
];
const BLANK = { name: '', account: '', profile: '', vertical: '', regions: [], source: '', acv: '', products: [], problem: '' };
const REGION_NAMES = { US: 'US', CA: 'Canada', UK: 'UK', EU: 'EU' };

class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.state = {
      screen: 'list', tab: 'activity', form: Object.assign({}, BLANK), filling: false, pick: '',
      phase: 'idle', progress: 0, pass: 0, result: null, showWhy: false,
      noteOpen: false, noteText: '', copied: false, toast: '', live: false,
      deal: null, acts: [], run: null, preds: []
    };
    this.timers = [];
  }

  // ---------- data ----------
  componentDidMount() {
    this.db = window.supabase.createClient(window.CONFIG.SUPABASE_URL, window.CONFIG.SUPABASE_KEY);
    this.refresh(true);
    // live updates from the database (the platform writes here too), plus a slow poll as a safety net
    this.channel = this.db.channel('crm')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deals' }, () => this.refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'predictions' }, () => this.refresh())
      .subscribe((status) => this.setState({ live: status === 'SUBSCRIBED' }));
    this.poll = setInterval(() => this.refresh(), 5000);
  }

  async refresh(first) {
    const [d, a, r, p] = await Promise.all([
      this.db.from('deals').select('*').eq('id', DEAL_ID).maybeSingle(),
      this.db.from('activities').select('*').eq('deal_id', DEAL_ID).order('created_at'),
      this.db.from('model_runs').select('*').eq('deal_id', DEAL_ID).order('run_no', { ascending: false }).limit(1),
      this.db.from('predictions').select('*').eq('deal_id', DEAL_ID).order('id')
    ]);
    const deal = d.data || null;
    const prev = this.state.deal;
    if (!first && prev && deal && !prev.engineer && deal.engineer) this.say(deal.engineer + ' picked this up in the platform.');
    const o = { deal, acts: a.data || [], run: (r.data || [])[0] || null, preds: p.data || [] };
    if (deal && (first || this.state.screen === 'list')) {
      o.screen = 'record';
      o.form = { name: deal.name, account: deal.account, profile: deal.profile, vertical: deal.vertical, regions: deal.regions, source: deal.source, acv: deal.acv, products: deal.products, problem: deal.problem };
      if (o.run && this.state.phase === 'idle') o.phase = 'done';
    }
    if (!deal && prev) Object.assign(o, { screen: 'list', form: Object.assign({}, BLANK), phase: 'idle', result: null, noteText: '', copied: false });
    this.setState(o);
  }

  say(msg) {
    clearTimeout(this.toastTimer);
    this.setState({ toast: msg });
    this.toastTimer = setTimeout(() => this.setState({ toast: '' }), 3600);
  }

  later(fn, ms) { this.timers.push(setTimeout(fn, ms)); }

  // ---------- actions ----------
  fill() {
    const steps = [
      ['name', 'Resale marketplace'], ['account', 'Resale marketplace'], ['profile', 'Peer-to-peer resale marketplace, US'],
      ['vertical', 'Online marketplace'], ['regions', ['US']], ['source', 'AEO'], ['acv', '$$'], ['products', ['Core', 'IDComply']],
      ['problem', 'Sellers overseas pose as local sellers to get around our fees and our rules. Buyers only find out when the parcel arrives.']
    ];
    this.setState({ pick: '', filling: true });
    steps.forEach((s, i) => this.later(() => {
      this.setState({ form: Object.assign({}, this.state.form, { [s[0]]: s[1] }) });
      if (i === steps.length - 1) this.setState({ filling: false });
    }, 140 * (i + 1)));
  }

  canSave() { const f = this.state.form; return !!(f.name && f.vertical && f.products.length) && !this.state.deal; }

  async save() {
    if (!this.canSave()) return;
    const f = this.state.form;
    const ins = await this.db.from('deals').insert({ id: DEAL_ID, name: f.name, account: f.account || f.name, vertical: f.vertical, profile: f.profile, regions: f.regions, products: f.products, source: f.source, acv: f.acv, problem: f.problem });
    if (ins.error) { this.say('Could not save: ' + ins.error.message); return; }
    this.setState({ screen: 'record', tab: 'activity', pick: '' });
    this.say('Opportunity “' + f.name + '” was created.');
    await this.refresh();
    this.runModel(1);
  }

  async runModel(pass) {
    this.setState({ phase: 'calling', pass, progress: 0, showWhy: false });
    const res = await this.db.functions.invoke('predict', { body: { deal_id: DEAL_ID } });
    if (res.error || !res.data || res.data.error) {
      this.setState({ phase: this.state.run ? 'done' : 'idle' });
      this.say('The model could not run. Check the Supabase function.');
      return;
    }
    const data = res.data;
    // the scores are real; we just reveal them one by one so the audience can see the comparison
    const order = data.neighbours.slice().sort((a, b) => a.id.localeCompare(b.id));
    this.setState({ phase: 'running', result: Object.assign({}, data, { order }), progress: 0 });
    const iv = setInterval(() => {
      const n = this.state.progress + 1;
      if (n >= order.length) { clearInterval(iv); this.refresh().then(() => this.setState({ progress: order.length, phase: 'done' })); return; }
      this.setState({ progress: n });
    }, 95);
    this.timers.push(iv);
  }

  fillNote() {
    this.setState({ noteOpen: true, noteText: '' });
    const parts = NOTE.split(' ');
    parts.forEach((w, i) => this.later(() => this.setState({ noteText: parts.slice(0, i + 1).join(' ') }), 45 * (i + 1)));
  }

  async saveNote() {
    if (this.state.noteText !== NOTE) return;
    const a = await this.db.from('activities').insert({ deal_id: DEAL_ID, kind: 'call', subject: 'Call: technical scoping with their head of trust', body: NOTE });
    if (a.error) { this.say('Could not log the call: ' + a.error.message); return; }
    await this.db.from('deals').update({ stage: 'Technical scoping', days_open: 21 }).eq('id', DEAL_ID);
    this.setState({ noteOpen: false, tab: 'activity' });
    this.say('Call was logged.');
    await this.refresh();
    this.runModel(2);
  }

  async requestEngineer() {
    await this.db.from('deals').update({ eng_requested: true }).eq('id', DEAL_ID);
    this.say('Engineering has been asked to join your next call.');
    this.refresh();
  }

  async closeWon() {
    const d = this.state.deal;
    if (!d || d.closed_won) return;
    await this.db.from('deals').update({ closed_won: true, stage: 'Closed Won' }).eq('id', DEAL_ID);
    this.say('Stage changed to Closed Won.');
    this.refresh();
  }

  async reset() {
    this.timers.forEach((t) => { clearTimeout(t); clearInterval(t); });
    this.timers = [];
    await this.db.rpc('reset_demo');
    this.setState({ screen: 'list', tab: 'activity', form: Object.assign({}, BLANK), pick: '', phase: 'idle', progress: 0, pass: 0, result: null, showWhy: false, noteOpen: false, noteText: '', copied: false, deal: null, acts: [], run: null, preds: [] });
    this.say('Demo reset.');
  }

  // ---------- values for the page ----------
  renderVals() {
    const st = this.state;
    const set = (o) => this.setState(o);
    const f = st.form;
    const deal = st.deal;
    const noteLogged = st.acts.length > 0;
    const closed = !!(deal && deal.closed_won);

    const listRows = (deal ? [[deal.name, deal.profile, deal.stage, deal.owner, true]] : []).concat(OTHER_DEALS).map((r, i) => ({ n: String(i + 1), name: r[0], profile: r[1], stage: r[2], owner: r[3], cls: 'ltr' + (r[4] ? ' fresh' : '') }));

    const OPTS = {
      vertical: ['Online marketplace', 'Dating & social', 'Gig economy', 'Healthcare', 'Digital banking', 'Media & streaming', 'Government services', 'Charity & donations'],
      regions: ['US', 'CA', 'UK', 'EU'], source: ['AEO', 'Inbound', 'Outbound', 'Referral'], acv: ['$', '$$', '$$$']
    };
    const LBL = { vertical: 'Vertical', regions: 'Region', source: 'Lead Source', acv: 'Est. ACV Band' };
    const picks = Object.keys(OPTS).map((k) => {
      const v = k === 'regions' ? f.regions.map((r) => REGION_NAMES[r] || r).join(', ') : f[k];
      return {
        label: LBL[k], value: v || '--None--', vcls: v ? 'pv' : 'pv empty', open: st.pick === k,
        toggle: () => set({ pick: st.pick === k ? '' : k }),
        options: OPTS[k].map((o) => ({ t: k === 'regions' ? REGION_NAMES[o] : o, cls: 'opt' + ((k === 'regions' ? f.regions.indexOf(o) >= 0 : f[k] === o) ? ' on' : ''), pick: () => set({ pick: '', form: Object.assign({}, f, { [k]: k === 'regions' ? [o] : o }) }) }))
      };
    });
    const prodChecks = [['Core', 'GeoComply Core'], ['GeoGuard', 'GeoGuard'], ['IDComply', 'IDComply']].map((p) => {
      const on = f.products.indexOf(p[0]) >= 0;
      return { t: p[1], on: on ? 'true' : 'false', cls: 'chk' + (on ? ' on' : ''), toggle: () => set({ form: Object.assign({}, f, { products: on ? f.products.filter((x) => x !== p[0]) : f.products.concat([p[0]]) }) }) };
    });

    const STAGES = ['Discovery', 'Solution design', 'Technical scoping', 'Business case', 'Security review', 'Pricing', 'Proposal', 'Closed'];
    const cur = closed ? 8 : (noteLogged ? 2 : 0);
    const steps = STAGES.map((t, i) => {
      const last = i === STAGES.length - 1;
      let cls = 'step' + (i === 0 ? ' first' : '') + (last ? ' last' : '');
      if (i < cur) cls += ' done';
      if (i === cur) cls += ' cur';
      if (closed && last) cls += ' won';
      return { t: closed && last ? 'Closed Won' : t, cls, done: i < cur && !(closed && last), showT: !(i < cur) || (closed && last), go: last ? () => this.closeWon() : () => {} };
    });

    // guidance card, built from the predictions table
    const assigned = !!(deal && deal.engineer);
    const preds = st.preds.map((p) => {
      const S = SALES[p.tag] || { from: '', text: '', next: '' };
      const from = (p.evidence && p.evidence.from) || [];
      const fromTxt = from.map((x) => x.name + ' (' + Math.round(x.sim * 100) + '% match)').join(' and ');
      let evidence;
      if (p.raised) evidence = 'Raised on your call 3 weeks in.' + (from.length ? ' ' + fromTxt + ' got stuck on it too.' : '');
      else if (p.kind === 'product') evidence = 'Known IDComply issue from support calls.';
      else evidence = 'Similar deals hit this: ' + fromTxt + '.';
      let hasBtn = false; let btnLabel = ''; let btnGo = () => {}; let hasState = false; let stateText = '';
      if (S.btn === 'engineer') {
        if (assigned) { hasState = true; stateText = deal.engineer + ' is joining your next call.'; }
        else if (deal && deal.eng_requested) { hasState = true; stateText = 'Engineer requested. It’s on their board.'; }
        else { hasBtn = true; btnLabel = 'Bring an engineer to the next call'; btnGo = () => this.requestEngineer(); }
      }
      if (S.btn === 'copy') { hasBtn = true; btnLabel = st.copied ? 'Copied' : 'Copy a note for the buyer'; btnGo = () => { set({ copied: true }); this.say('Copied a short note about the preset test profile.'); }; }
      return {
        cls: 'gp ' + p.status, label: TAGS[p.tag] || p.tag, st: p.status === 'now' ? 'Stuck now' : 'Potential stick', evidence,
        wLabel: S.fix ? 'What worked before' : 'What happened before', wFrom: S.from, wText: S.text, next: S.next,
        hasBtn, btnLabel, btnGo, btnCls: 'gbtn' + (p.status === 'now' ? '' : ' solid'), hasState, stateText,
        hasMsg: !!S.msg, msgLabel: S.msg ? 'Message ' + S.msg : '', msgGo: () => this.say('Opens a Slack message to ' + S.msg + '.')
      };
    });
    const res = st.result;
    const n = res ? res.compared : (st.run ? st.run.compared : 17);
    const runRows = res ? res.order.slice(0, st.progress).slice(-7).map((r) => ({ name: r.name, group: r.group, pct: Math.round(r.sim * 100) + '%', bar: 'width: ' + Math.round(r.sim * 100) + '%' })) : [];
    const neighbours = st.run ? st.run.neighbours : [];
    const whyRows = neighbours.map((r, i) => ({
      name: r.name, group: r.group, pct: Math.round(r.sim * 100) + '%', bar: 'width: ' + Math.round(r.sim * 72) + 'px',
      tags: r.sticking_points.length ? r.sticking_points.map((t) => TAGS[t] || t).join(', ') : 'Nothing logged', cls: 'wr' + (i < 5 ? ' top' : '')
    }));
    const engCount = 0;
    const s = {
      isList: st.screen !== 'record' || !deal, isRecord: st.screen === 'record' && !!deal,
      newOpen: st.screen === 'new' && !deal,
      openNew: () => { if (!deal) set({ screen: 'new' }); },
      closeNew: () => set({ screen: 'list', pick: '' }),
      toList: () => set({ screen: deal ? 'record' : 'list' }),
      listRows, listCount: String(listRows.length), reset: () => this.reset(),
      f: { name: f.name, account: f.account, profile: f.profile, acv: f.acv || '', source: f.source || '', problem: f.problem },
      picks, prodChecks, fill: () => this.fill(), save: () => this.save(), saveCls: 'bb' + (this.canSave() ? '' : ' off'),
      days: String(deal ? deal.days_open : 0), stepsV: steps, markLabel: closed ? 'Closed Won' : 'Mark Stage as Complete',
      platformUrl: window.CONFIG.PLATFORM_URL || '#', hasPlatform: !!window.CONFIG.PLATFORM_URL, live: st.live, liveCls: 'ld' + (st.live ? ' on' : ''), liveText: st.live ? 'Live' : 'Synced',
      closed, closedText: 'Closed won. Handed to Jordan Lee’s pod.',
      calling: st.phase === 'calling', running: st.phase === 'running', done: st.phase === 'done', idle: st.phase === 'idle',
      callText: st.pass === 2 ? 'Sending your call notes to the model' : 'Sending the deal to the model',
      runTitle: st.pass === 2 ? 'Updating with your call notes' : 'Comparing with ' + n + ' past deals',
      runCount: st.progress + ' of ' + n, runBar: 'width: ' + Math.round(st.progress / (n || 1) * 100) + '%', runRows,
      modelLine: 'Compared with ' + n + ' past deals from the database. Closest: ' + neighbours.slice(0, 3).map((x) => x.name).join(', ') + '.',
      whyOpen: st.showWhy, whyLabel: st.showWhy ? 'Hide how it decided' : 'See how it decided', toggleWhy: () => set({ showWhy: !st.showWhy }),
      whyRows, whyFoot: 'Match blends industry (35%), products (35%), the buyer’s words (20%), lead source (5%) and region (5%). The 5 closest deals, in bold, vote on what this one could get stuck on.',
      preds, showPreds: !closed,
      tabs: [['activity', 'Activity'], ['details', 'Details'], ['chatter', 'Chatter']].map((t) => ({ label: t[1], cls: 'stab' + (st.tab === t[0] ? ' on' : ''), sel: st.tab === t[0] ? 'true' : 'false', pick: () => set({ tab: t[0] }) })),
      isActivity: st.tab === 'activity', isDetails: st.tab === 'details', isChatter: st.tab === 'chatter',
      openNote: () => set({ noteOpen: true, tab: 'activity' }), closeNote: () => set({ noteOpen: false }), fillNote: () => this.fillNote(), saveNote: () => this.saveNote(),
      noteOpen: st.noteOpen, noteText: st.noteText, noteSaveCls: 'bb' + (st.noteText === NOTE ? '' : ' off'),
      noteLogged, noNote: !noteLogged, noteBody: noteLogged ? st.acts[0].body : '',
      fields: [['Opportunity Name', f.name], ['Opportunity Owner', 'Lena Ortiz'], ['Account Name', f.account], ['Vertical', f.vertical], ['Account Profile', f.profile], ['Region', f.regions.map((r) => REGION_NAMES[r] || r).join(', ')], ['Lead Source', f.source], ['Products Discussed', f.products.join(', ')], ['Stage', deal ? deal.stage : 'Discovery'], ['Est. ACV Band', f.acv]].map((x) => ({ k: x[0], v: x[1] || '' })),
      prodRows: f.products.map((p) => ({ t: p === 'Core' ? 'GeoComply Core' : p })), prodCount: String(f.products.length + engCount)
    };
    return { s, hasToast: st.toast !== '', toast: st.toast };
  }
}
