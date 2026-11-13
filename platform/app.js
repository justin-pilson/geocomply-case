// GeoComply deal platform: engineering, pods and marketing.
// Reads the live demo deal, its logged calls and the model's predictions from Supabase, and updates as soon as Salesforce changes them.

const DEAL_ID = 'NV-083';
const REGION_NAMES = { US: 'US', CA: 'Canada', UK: 'UK', EU: 'EU' };
const GROUP = { 'Online marketplace': 'Consumer apps', 'Dating & social': 'Consumer apps', 'Gig economy': 'Consumer apps', 'Healthcare': 'Health', 'Digital banking': 'Fintech', 'Media & streaming': 'Media & events', 'Government services': 'Government', 'Charity & donations': 'Charity' };
const TAGS = {
  prompt: { label: 'Permission prompt', issue: 'prompt' }, oneapi: { label: 'One API', issue: 'oneapi' }, browser: { label: 'Locked browser', issue: 'browser' },
  partial: { label: 'Staging partials', issue: 'partial' }, dates: { label: 'UK date format', issue: 'dates' },
  security: { label: 'Security review' }, price: { label: 'Price against IP-only checks' }, bots: { label: 'Not seen as anti-bot' }, selfserve: { label: 'Wants self-serve' },
  budget: { label: 'No clear budget owner' }, legal: { label: 'Legal review' }, procurement: { label: 'Approved vendor list' }
};

class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.state = {
      team: 'eng', engRoute: 'deals', engId: '', fixFrom: '', assignee: {},
      podFilter: 'all', podRoute: 'list', podId: '', drawerKind: '', drawerId: '', srcFrom: '', podStatus: {}, podAssigned: false,
      mktSel: 'notice', covered: {}, toast: '', conn: false, live: { deal: null, acts: [], preds: [] }
    };
    this.timer = null;
  }

  componentWillUnmount() { if (this.timer) clearTimeout(this.timer); }

  say(msg) {
    if (this.timer) clearTimeout(this.timer);
    this.setState({ toast: msg });
    this.timer = setTimeout(() => this.setState({ toast: '' }), 3400);
  }

  top() { try { window.scrollTo(0, 0); } catch (err) { /* preview frames may block scrolling */ } }

  data() {
    if (this._d) return this._d;
    const PEOPLE = {
      sam: ['SP', 'Sam Patel', 'Account executive', 'background: #EEF2F7; color: #0A003C'],
      lena: ['LO', 'Lena Ortiz', 'Account executive', 'background: #F1E8FF; color: #5B21B6'],
      marcus: ['MR', 'Marcus Reid', 'Account executive', 'background: #FFF4D6; color: #7A5200'],
      maya: ['MC', 'Maya Chen', 'Forward-deployed engineer', 'background: #0041ED; color: #FFFFFF'],
      jordan: ['JL', 'Jordan Lee', 'Customer Success Manager, fintech pod', 'background: #FF9F73; color: #0A003C'],
      ama: ['AM', 'Ama Mensah', 'Customer Success Manager, Stawks.io pod', 'background: #DDF6EE; color: #00664A'],
      tom: ['TO', 'Tom Okafor', 'Customer Success Manager, TV.NZ pod', 'background: #E8EEFF; color: #0033BD'],
      leo: ['LM', 'Leo Martin', 'Customer Success Manager, GreenTeam Health pod', 'background: #DDF6EE; color: #00664A'],
      andriy: ['AK', 'Andriy Koval', 'Technical Support Specialist', 'background: #FFEBDD; color: #9A3600']
    };
    // Deal records from the Vertical Pipeline Extract (AE names are made up)
    const DEALS = {
      'NV-014': ['Neobank', 'Neobank, Canada, about 400k customers', 'Security review, stalled 412 days', 'GeoComply Core, GeoGuard', 'We’re seeing logins from three countries in an hour on the same account. Our fraud team finds out after the money’s gone.', 'Internal champion still loves it. Vendor risk questionnaire is on round 4.', 'sam'],
      'NV-022': ['Sports broadcaster', 'Sports broadcaster, Latin America', 'Closed, lost at pricing', 'GeoGuard', 'Viewers outside our rights territory are watching our matches through VPNs and our rights holders are noticing.', 'Went with a basic IP database at roughly a tenth of our price. Their words: “good enough for now.”', 'marcus'],
      'NV-031': ['Dating app', 'Dating app, US, about 2M monthly users', 'Technical scoping, stalled 318 days', 'GeoComply Core, IDComply', 'People lie about where they are. Some of them are running romance scams from overseas. We need to know who’s real without slowing down sign-up.', 'Product lead asked if it can run without the user ever noticing. Waiting on their legal and ours.', 'lena'],
      'NV-083': ['Resale marketplace', 'Peer-to-peer resale marketplace, US', 'Technical scoping, 176 days', 'GeoComply Core, IDComply', 'Sellers overseas pose as local sellers to get around our fees and our rules. Buyers only find out when the parcel arrives.', 'Wants to know if location can be checked without ever showing users a permission prompt.', 'lena'],
      'NV-099': ['Ticketing company', 'Primary ticketing company, US', 'Closed, lost at proposal', 'GeoComply Core, GeoGuard', 'Presales for local fans get wiped out by bots and resellers in minutes.', 'Lost to a bot-mitigation vendor. They didn’t think of us as an anti-bot company.', 'marcus'],
      'NV-109': ['Youth social app', 'Youth-focused social app, UK and US', 'Closed, won pilot', 'IDComply, GeoComply Core', 'New age-assurance laws are coming in both our markets and we have adults trying to get into spaces built for teenagers.', 'CEO joined the second call. Customer success asking who owns it post-pilot.', 'lena'],
      'NV-123': ['Exam proctoring', 'Online exam proctoring provider, global', 'Technical scoping, stalled 115 days', 'GeoComply Core', 'Test-takers are sitting exams from countries where the credential isn’t valid, or using someone else in another room.', 'Their app runs inside a locked-down browser. Eng estimate is ~6 weeks to support it.', 'marcus'],
      'NV-134': ['Prediction market', 'Event-contract platform, US', 'Pricing, 94 days', 'GeoComply Core, GeoGuard, IDComply', 'We’re launching in new states fast and the rules change month to month. We need to know where every trader is, every time.', 'Fastest inbound of the year. Legal wants a conversation before we send pricing.', 'marcus'],
      'NV-141': ['Cross-border payments', 'Cross-border payments company, UK and EU, about 120 staff', 'Discovery, 71 days', 'GeoGuard, GeoComply Core', 'Our sanctions screening checks the IP address and that’s it. Our auditors have started asking whether that’s enough.', 'Arrived having already compared three vendors with an AI assistant.', 'sam'],
      'NV-158': ['Consumer lender', 'Consumer lender, US', 'Closed, won', 'IDComply, GeoComply Core', 'Synthetic identities are getting through our onboarding and defaulting on the first payment.', 'Started as an identity deal. Location added in month two once their fraud team saw the device signals.', 'sam'],
      'NV-166': ['Sports streaming', 'Sports streaming service, EU', 'Closed, won', 'GeoComply Core, GeoGuard', 'Our new league contract says we have to prove viewers are in-territory, not just try to block VPNs.', 'The rights contract did the selling. Moved from IP-only checks to Core.', 'marcus'],
      'NV-172': ['Benefits administrator', 'Benefits administrator, US multi-state', 'Closed, won', 'GeoComply Core, IDComply', 'Members can only move large sums from states where we’re licensed, and we need an audit trail for it.', 'Second customer in the sector. Asked to copy the existing health customer’s setup.', 'marcus'],
      'NV-180': ['Licence renewals', 'Provincial online licence renewals, Canada', 'Discovery, 34 days', 'GeoComply Core, IDComply', 'Residents can renew online only while they live in the province. We have no way to check that today.', 'Formal RFP expected next quarter. Procurement says vendors must be named on a public approved list first.', 'marcus'],
      'NV-184': ['Delivery platform', 'Delivery platform, US and Canada', 'Solution design, stalled', 'IDComply, GeoComply Core, GeoGuard', 'Verified couriers are renting their accounts to people we’ve never checked. We need to know the person on the shift is the person we approved.', 'They asked for “one API.” We sent four integration docs. No reply in 6 weeks.', 'lena'],
      'NV-191': ['Donation platform', 'Online donation platform, US and UK', 'Proposal, 4 days', 'GeoGuard', 'Overseas fraudsters test stolen cards with tiny donations. Our processor is threatening to raise our fees.', 'Wanted a self-serve plan they could pay for by card that day. Went with a vendor that offers one.', 'lena'],
      'NV-205': ['Halden Pay', 'Buy-now-pay-later app, UK and EU (example deal)', 'Closed, won on day 58', 'IDComply, GeoComply Core, GeoGuard', 'We can’t add steps to sign-up. Conversion is everything.', 'Won. IDComply in the UK first, EU after 60 days of results.', 'sam']
    };
    const QBR = 'Forward deployed pods: quarterly review';
    const SUP = 'Technical support shadowing';
    // Excerpts are word for word from the two transcripts
    const SRC = {
      'qbr-stawks': { kind: 'Meeting transcript', title: QBR, when: 'Jun 18, at 21:30', speaker: 'Ama Mensah, Stawks.io pod', label: 'QBR, Jun 18 at 21:30', ask: ['ama'], open: 'Open the full transcript',
        lines: ['“When we launched, about 22 percent of their users were getting asked to share their location.”', '“So we put two of our engineers in a shared channel with their team for a week, tuned it together, and now it’s down to 9 percent.”'] },
      'qbr-tvnz-popup': { kind: 'Meeting transcript', title: QBR, when: 'Jun 18, at 12:40', speaker: 'Tom Okafor, quoting TV.NZ’s head of digital', label: 'QBR, Jun 18 at 12:40', ask: ['tom'], open: 'Open the full transcript',
        lines: ['“Our viewers will never accept a location pop-up. If people get asked for their location before the match starts, they’ll go and watch it somewhere else.”'] },
      'qbr-tvnz-ip': { kind: 'Meeting transcript', title: QBR, when: 'Jun 18, at 15:10', speaker: 'Tom Okafor, TV.NZ pod', label: 'QBR, Jun 18 at 15:10', ask: ['tom'], open: 'Open the full transcript',
        lines: ['“…a smaller competitor pitched them last month. IP-only checks, cheaper than what they pay us now.”', '“They found about six percent of streams were coming from outside New Zealand, mostly through home internet connections people rent out, which are hard to spot from the connection alone.”'] },
      'qbr-green': { kind: 'Meeting transcript', title: QBR, when: 'Jun 18, at 29:40', speaker: 'Leo Martin, GreenTeam Health pod', label: 'QBR, Jun 18 at 29:40', ask: ['leo'], open: 'Open the full transcript',
        lines: ['“They’re getting fake member accounts. The ID documents check out fine, but our device and location signals on those same accounts look off.”', '“And they’re getting bot attacks overnight, thousands of sign-up attempts in an hour.”'] },
      'support-dates': { kind: 'Meeting transcript', title: SUP, when: 'Sep 16, at 23:40', speaker: 'Andriy Koval, technical support', label: 'Support session, Sep 16 at 23:40', ask: ['andriy'], open: 'Open the full transcript',
        lines: ['“Then I check what our system read: May 11, not November 5.”', '“It was in an integration guide our solutions engineer emailed to Ashgrove when they started, three years ago.”'] },
      'support-partial': { kind: 'Meeting transcript', title: SUP, when: 'Sep 16, at 28:30', speaker: 'Andriy Koval, technical support', label: 'Support session, Sep 16 at 28:30', ask: ['andriy'], open: 'Open the full transcript',
        lines: ['“In staging, it doesn’t. The test vendor expects an exact match.”', '“Our documentation only says ‘use test data.’ It doesn’t say any of this.”'] },
      'halden-call1': { kind: 'Call notes', title: 'Halden Pay: first call', when: 'Day 1', speaker: 'Logged by Sam Patel', label: 'Call notes, day 1', ask: ['sam'], open: 'Open in Salesforce',
        lines: ['Alex Moreno, Head of Product: “We can’t add steps to sign-up. Conversion is everything.”'] },
      'halden-scoping': { kind: 'Call notes', title: 'Halden Pay: technical scoping call', when: 'Day 25', speaker: 'Logged by Maya Chen', label: 'Scoping call, day 25', ask: ['maya', 'sam'], open: 'Open in Salesforce',
        lines: ['Alex asked whether users would see a location prompt at sign-up.', 'Maya walked through the Stawks.io fix (22% of users asked, down to 9%). Halden Pay agreed to test it.'] },
      'halden-sec': { kind: 'Deal activity', title: 'Halden Pay: security review', when: 'Days 3 to 19', speaker: '', label: 'Deal activity', ask: ['sam'], open: 'Open in Salesforce',
        lines: ['Day 3: security pack sent.', 'Day 9: Halden Pay’s security team started their review.', 'Day 19: review cleared.'] },
      'halden-budget': { kind: 'Call notes', title: 'Halden Pay: call with Dana Ruiz', when: 'Day 14', speaker: 'Logged by Sam Patel', label: 'Call notes, day 14', ask: ['sam'], open: 'Open in Salesforce',
        lines: ['Dana Ruiz, Head of Risk, joined and said she signs off on fraud tools.'] },
      'halden-slow': { kind: 'Deal activity', title: 'Halden Pay: business case', when: 'Days 40 to 44', speaker: '', label: 'Deal activity', ask: ['sam'], open: 'Open in Salesforce',
        lines: ['Day 40: slower than similar deals at business case.', 'Day 44: UK-only start offered. The deal moved again.'] }
    };
    // Links that leave the platform (shown as a message in the prototype)
    const EXTERNAL = {
      'slack-stawks': ['Slack channel', 'Opens the shared Slack channel with Stawks.io.'],
      'jira-stawks': ['Jira tickets', 'Opens the Jira tickets for the Stawks.io prompt work.'],
      'email-dates': ['Original email', 'Opens the integration guide email sent to Ashgrove Bet.']
    };
    const ISSUE = {
      prompt: { short: 'Permission prompt', fixes: ['prompt'] },
      dates: { short: 'UK date format', fixes: ['dates'] },
      partial: { short: 'Staging partials', fixes: ['partial'] },
      browser: { short: 'Locked browser', fixes: [], estimate: 'Their app runs in a locked-down browser our checks don’t support. Estimate: about 6 weeks of engineering.' },
      oneapi: { short: 'One API', fixes: [], estimate: 'We send a separate integration document for each product. Not scoped yet.' }
    };
    const FIX = {
      prompt: { title: 'Fewer location prompts at sign-up', by: 'Stawks.io pod', summary: 'Tuned with the customer’s engineers so far fewer users get asked for their location.',
        problem: 'At launch, 22% of Stawks.io users were asked to share their location at sign-up. Their own testing showed every 10 points of that loses 2 to 3 of every 100 people signing up.',
        fix: 'Two engineers worked in a shared Slack channel with Stawks’ engineers for a week and tuned the setup together.',
        resultLabel: 'Result', result: 'Users asked for location fell from 22% to 9%. Stawks’ CTO called it the best vendor team they’ve worked with.',
        sources: ['qbr-stawks', 'slack-stawks', 'jira-stawks'], ask: ['ama', 'maya'],
        used: [['ST', 'Stawks.io', 'Customer'], ['HP', 'Halden Pay', 'Won deal']] },
      dates: { title: 'UK dates of birth read as US dates', by: 'Andriy Koval, technical support', summary: 'IDComply read UK dates as US dates and rejected an 18-year-old as underage.',
        fix: 'Send dates of birth in the format IDComply expects. Today the format is only in an integration guide a solutions engineer emailed to one customer three years ago, not in the public docs.',
        problem: 'A UK player entered 05/11/2008. IDComply read it as May 11, not 5 November, so an 18-year-old was rejected as underage.',
        resultLabel: 'What it cost', result: 'Support needed 3 days to find the answer. By then the customer had called their account director, and the player never came back.',
        sources: ['support-dates', 'email-dates'], ask: ['andriy'],
        used: [['AB', 'Ashgrove Bet', 'Customer']] },
      partial: { title: 'Partial results won’t trigger in staging', by: 'Andriy Koval, technical support', summary: 'Typos on test profiles fail in staging instead of returning a partial result.',
        problem: 'A customer testing in staging added a typo to a test profile to trigger a partial result. It failed outright instead.',
        fix: 'Use the preset partial-result test profile. The staging test vendor only accepts exact matches, which the docs didn’t say.',
        resultLabel: 'Result', result: 'Answered the same day. The testing docs are being rewritten so the next customer doesn’t have to ask.',
        sources: ['support-partial'], ask: ['andriy'],
        used: [['MG', 'Marigold Gaming', 'Customer']] }
    };
    // issues: [issue, when, why, source]
    const eng = [
      { id: 'NV-134', ini: 'PM', name: 'Prediction market', industry: 'Prediction markets', stageShort: 'Pricing, 94 days', stage: 'Pricing', days: '94', products: 'Core, GeoGuard, IDComply', col: 'likely',
        issues: [['prompt', 'likely', 'A prediction market launching in new states, like Stawks.io was.', 'deal-NV-134'], ['oneapi', 'likely', 'Discussing all three products.', 'deal-NV-134'], ['partial', 'likely', 'Will test IDComply in staging before launch.', 'deal-NV-134']] },
      { id: 'NV-180', ini: 'LR', name: 'Licence renewals', industry: 'Government, Canada', stageShort: 'Discovery, 34 days', stage: 'Discovery', days: '34', products: 'Core, IDComply', col: 'likely',
        issues: [['dates', 'likely', 'Will verify Canadian residents with IDComply. Date formats vary in Canada.', 'deal-NV-180']] },
      { id: 'NV-031', ini: 'DA', name: 'Dating app', industry: 'Dating & social, US', stageShort: 'Technical scoping, stalled 318 days', stage: 'Technical scoping', days: '318, stalled', products: 'Core, IDComply', col: 'now',
        issues: [['prompt', 'now', 'Their product lead asked if it can run without the user ever noticing.', 'note-NV-031']] },
      { id: 'NV-083', ini: 'RM', name: 'Resale marketplace', industry: 'Online marketplace, US', stageShort: 'Technical scoping, 176 days', stage: 'Technical scoping', days: '176', products: 'Core, IDComply', col: 'now',
        issues: [['prompt', 'now', 'Wants to know if location can be checked without ever showing users a permission prompt.', 'note-NV-083'], ['partial', 'likely', 'Will be testing IDComply in staging during scoping.', 'deal-NV-083']] },
      { id: 'NV-184', ini: 'DP', name: 'Delivery platform', industry: 'Gig economy, US and Canada', stageShort: 'Solution design, stalled', stage: 'Solution design', days: '22, stalled', products: 'IDComply, Core, GeoGuard', col: 'now',
        issues: [['oneapi', 'now', 'Asked for one API. We sent four integration docs and they haven’t replied in 6 weeks.', 'note-NV-184'], ['dates', 'likely', 'Will verify couriers in Canada with IDComply.', 'deal-NV-184']] },
      { id: 'NV-123', ini: 'EP', name: 'Exam proctoring', industry: 'Education, global', stageShort: 'Technical scoping, stalled 115 days', stage: 'Technical scoping', days: '115, stalled', products: 'Core', col: 'now',
        issues: [['browser', 'now', 'Their app runs inside a locked-down browser.', 'note-NV-123']] },
      { id: 'NV-205', ini: 'HP', name: 'Halden Pay', industry: 'Fintech, UK and EU', stageShort: 'Won on day 58', stage: 'Closed, won', days: '58', products: 'IDComply (UK)', col: 'done', owner: 'maya',
        issues: [['prompt', 'solved', 'Worried users would see a location prompt at sign-up. Solved on the scoping call by reusing the Stawks fix.', 'halden-scoping']] }
    ];
    const pods = [
      { id: 'NV-205', ini: 'HP', name: 'Halden Pay', industry: 'Fintech', closed: 'This week', bought: 'IDComply, UK only', owner: 'jordan', base: 'new',
        during: [
          { t: 'Security review', how: 'Cleared in 19 days. The security pack went out in week one.', src: 'halden-sec' },
          { t: 'Will users notice the checks?', how: 'Solved on the scoping call with the Stawks prompt fix.', src: 'halden-scoping' },
          { t: 'No clear budget owner', how: 'Dana Ruiz, Head of Risk, confirmed on day 14.', src: 'halden-budget' },
          { t: 'Slowed at business case', how: 'Moved again after a UK-only start was offered.', src: 'halden-slow' }
        ],
        expects: ['No extra step at sign-up', 'An EU rollout conversation after 60 days of UK results'],
        people: [{ ini: 'DR', name: 'Dana Ruiz', role: 'Head of Risk. Signs off on budget.' }, { ini: 'AM', name: 'Alex Moreno', role: 'Head of Product. Judged on sign-up conversion.' }],
        watch: [{ t: 'UK date format', d: 'UK dates of birth can be read as US dates. Confirm the format at setup.', fix: 'dates', src: 'support-dates' }],
        team: [['sam', 'sales'], ['maya', 'engineering']] },
      { id: 'NV-172', ini: 'BA', name: 'Benefits administrator', industry: 'Health & benefits', closed: 'Q3 FY26', bought: 'Core, IDComply', owner: 'leo', base: 'new',
        during: [{ t: 'Asked to copy an existing setup', how: 'Wants the same setup as GreenTeam Health, our existing health customer.', src: 'note-NV-172' }],
        expects: ['Large money moves allowed only from licensed states, with an audit trail'],
        people: [],
        watch: [{ t: 'Fake accounts passing ID checks', d: 'At GreenTeam, fake member accounts passed the ID check while their device signals looked off. Keep both in one view.', src: 'qbr-green' }],
        team: [['marcus', 'sales']] },
      { id: 'NV-109', ini: 'YS', name: 'Youth social app', industry: 'Online safety', closed: 'Pilot won', bought: 'IDComply, Core', owner: null, base: 'owner',
        during: [{ t: 'No owner after the pilot', how: 'Customer success asked who owns the account once the pilot ends.', open: true, src: 'note-NV-109' }],
        expects: ['To be ready for new age-assurance laws in the UK and US'],
        people: [{ ini: 'CE', name: 'Their CEO', role: 'Joined the second call.' }],
        watch: [{ t: 'UK date format', d: 'They verify UK users. Confirm the date format at setup.', fix: 'dates', src: 'support-dates' }],
        team: [['lena', 'sales']] },
      { id: 'NV-158', ini: 'CL', name: 'Consumer lender', industry: 'Fintech', closed: 'Q2 FY26', bought: 'IDComply, Core', owner: 'jordan', base: 'reviewed',
        during: [{ t: 'Started small', how: 'Bought identity checks first. Location was added in month two once their fraud team saw the device signals.', src: 'note-NV-158' }],
        expects: ['Help stopping synthetic identities that default on the first payment'],
        people: [], watch: [],
        team: [['sam', 'sales']] },
      { id: 'NV-166', ini: 'SS', name: 'Sports streaming', industry: 'Media & streaming', closed: 'Q3 FY26', bought: 'Core, GeoGuard', owner: 'tom', base: 'reviewed',
        during: [{ t: 'Rights contract', how: 'Their new league contract required proof that viewers are in-territory. That did the selling.', src: 'note-NV-166' }],
        expects: ['Proof for the league, not just VPN blocking'],
        people: [{ ini: 'LT', name: 'Their legal team', role: 'Brought the deal in.' }], watch: [],
        team: [['marcus', 'sales']] }
    ];
    // where: [initials, name, industry column, quote, outcome, source, who to ask]
    const topics = [
      { id: 'notice', q: 'Will users notice the checks?', base: 'open',
        where: [['DA', 'Dating app', 'Consumer apps', 'Asked if it can run without the user ever noticing', 'stalled', 'note-NV-031', 'lena'], ['RM', 'Resale marketplace', 'Consumer apps', 'Wants location checked without a permission prompt', 'active', 'note-NV-083', 'lena'], ['HP', 'Halden Pay', 'Fintech', '“We can’t add steps to sign-up.”', 'won', 'halden-call1', 'sam'], ['TV', 'TV.NZ', 'Media & events', '“Our viewers will never accept a location pop-up.”', 'customer', 'qbr-tvnz-popup', 'tom']] },
      { id: 'security', q: 'Can you pass our security review?', base: 'covered',
        where: [['NB', 'Neobank', 'Fintech', 'Vendor questionnaire is on round 4', 'stalled', 'note-NV-014', 'sam'], ['LR', 'Licence renewals', 'Government', 'Vendors must be on a public approved list first', 'active', 'note-NV-180', 'marcus'], ['CP', 'Cross-border payments', 'Fintech', 'Auditors are asking if IP checks are enough', 'active', 'deal-NV-141', 'sam'], ['HP', 'Halden Pay', 'Fintech', 'Security review came up in week one', 'won', 'halden-sec', 'sam']] },
      { id: 'ip', q: 'Why pay more than IP-only checks?', base: 'open',
        where: [['SB', 'Sports broadcaster', 'Media & events', 'Chose an IP database at a tenth of the price: “good enough for now”', 'lost', 'note-NV-022', 'marcus'], ['TV', 'TV.NZ', 'Media & events', 'A cheaper IP-only competitor pitched them', 'customer', 'qbr-tvnz-ip', 'tom']] },
      { id: 'bots', q: 'Do you stop bots?', base: 'open',
        where: [['TK', 'Ticketing company', 'Media & events', 'Lost to a bot-mitigation vendor. Didn’t see us as anti-bot.', 'lost', 'note-NV-099', 'marcus'], ['GH', 'GreenTeam Health', 'Health', 'Thousands of bot sign-ups in an hour, overnight', 'customer', 'qbr-green', 'leo']] },
      { id: 'selfserve', q: 'Can we sign up and pay by card?', base: 'product',
        where: [['DN', 'Donation platform', 'Charity', 'Wanted a plan they could pay for by card that day', 'lost', 'note-NV-191', 'lena']] }
    ];
    this._d = { PEOPLE, DEALS, SRC, EXTERNAL, ISSUE, FIX, eng, pods, topics };
    return this._d;
  }


  // ================= LIVE CONNECTION TO THE DATABASE =================
  componentDidMount() {
    this.db = window.supabase.createClient(window.CONFIG.SUPABASE_URL, window.CONFIG.SUPABASE_KEY);
    this.refresh(true);
    this.channel = this.db.channel('platform')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deals' }, () => this.refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activities' }, () => this.refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'predictions' }, () => this.refresh())
      .subscribe((status) => this.setState({ conn: status === 'SUBSCRIBED' }));
    this.poll = setInterval(() => this.refresh(), 5000);
  }

  async refresh(first) {
    if (this._busy) { this._again = true; return; }
    this._busy = true;
    try {
      const [d, a, p] = await Promise.all([
        this.db.from('deals').select('*').eq('id', DEAL_ID).maybeSingle(),
        this.db.from('activities').select('*').eq('deal_id', DEAL_ID).order('created_at'),
        this.db.from('predictions').select('*').eq('deal_id', DEAL_ID).order('id')
      ]);
      const live = { deal: d.data || null, acts: a.data || [], preds: p.data || [] };
      if (!first) this.announce(this.state.live, live);
      this.setState({ live });
    } finally {
      this._busy = false;
      if (this._again) { this._again = false; this.refresh(); }
    }
  }

  // Say what just came in from Salesforce, so the audience sees the two sites talking
  announce(prev, next) {
    const a = prev.deal;
    const b = next.deal;
    if (!b) return;
    const key = (ps) => ps.map((x) => x.tag + ':' + x.status).sort().join(',');
    if (!a) { this.say('New deal from Salesforce: ' + b.name + '. The model is running.'); return; }
    if (!a.closed_won && b.closed_won) { this.say(b.name + ' closed won in Salesforce. It’s in Pods now.'); return; }
    if (!a.eng_requested && b.eng_requested) { this.say('Lena Ortiz asked for an engineer on ' + b.name + '.'); return; }
    if (key(prev.preds) !== key(next.preds) && next.preds.length) {
      const newNow = next.preds.filter((x) => x.status === 'now' && !prev.preds.some((y) => y.tag === x.tag && y.status === 'now'));
      if (newNow.length) this.say('Model update: ' + newNow.map((x) => (TAGS[x.tag] || {}).label || x.tag).join(', ') + ' is now stuck on ' + b.name + '.');
      else this.say('Model finished: ' + next.preds.length + ' possible sticking points on ' + b.name + '.');
      return;
    }
    if (next.acts.length > prev.acts.length) this.say('Lena Ortiz logged a call on ' + b.name + ' in Salesforce.');
  }

  async assignDeal(id) {
    if (id === DEAL_ID && this.state.live.deal) {
      await this.db.from('deals').update({ engineer: 'Maya Chen' }).eq('id', DEAL_ID);
      this.say('Assigned to Maya Chen. Salesforce updates too.');
      this.refresh();
      return;
    }
    this.setState({ assignee: Object.assign({}, this.state.assignee, { [id]: true }) });
    this.say('Assigned to Maya Chen.');
  }

  // The platform's data, with the live deal from the database added in
  liveData() {
    const B = this.data();
    const L = this.state.live;
    const D = Object.assign({}, B);
    D.eng = B.eng.filter((d) => d.id !== DEAL_ID);
    D.topics = B.topics.map((t) => Object.assign({}, t, { where: t.where.filter((w) => w[5] !== 'note-' + DEAL_ID) }));
    D.pods = B.pods.slice();
    D.DEALS = Object.assign({}, B.DEALS);
    const deal = L.deal;
    if (!deal) return D;
    const preds = L.preds.map((r) => ({ tag: r.tag, status: r.status, kind: r.kind, raised: r.raised, from: (r.evidence && r.evidence.from) || [] }));
    const noteLogged = L.acts.length > 0;
    const note = noteLogged ? L.acts[0].body : '';
    const assigned = !!deal.engineer;
    const closed = !!deal.closed_won;
    const stage = closed ? 'Closed, won' : deal.stage;
    const days = String(deal.days_open);
    D.DEALS[DEAL_ID] = [deal.name, deal.profile || deal.vertical, stage + ', day ' + days, deal.products.map((p) => (p === 'Core' ? 'GeoComply Core' : p)).join(', '), deal.problem || '', noteLogged ? note : 'New deal. No calls logged yet.', 'lena'];
    const techs = preds.filter((p) => TAGS[p.tag] && TAGS[p.tag].issue);
    const issues = techs.map((p) => {
      const why = p.raised ? note : (p.kind === 'product' ? 'Known IDComply issue from support calls. They’ll test in staging.' : 'Seen on ' + p.from.map((x) => x.name).join(' and ') + ', a similar deal.');
      const status = closed ? (p.status === 'now' && assigned ? 'solved' : p.status) : p.status;
      return [TAGS[p.tag].issue, status, why, p.raised ? 'note-' + DEAL_ID : 'deal-' + DEAL_ID];
    });
    const col = closed ? 'done' : (techs.some((p) => p.status === 'now') ? 'now' : 'likely');
    const regions = deal.regions.map((r) => REGION_NAMES[r] || r).join(' and ');
    D.eng.push({ id: DEAL_ID, ini: 'RM', name: deal.name, industry: deal.vertical + (regions ? ', ' + regions : ''), stageShort: closed ? 'Won on day ' + days : deal.stage + ', day ' + days, stage, days, products: deal.products.join(', '), col, demo: true, requested: deal.eng_requested, owner: assigned ? 'maya' : undefined, issues });
    if (preds.some((p) => p.tag === 'prompt' && p.raised)) {
      D.topics = D.topics.map((t) => (t.id === 'notice' ? Object.assign({}, t, { where: [['RM', deal.name, GROUP[deal.vertical] || 'Consumer apps', 'Wants location checked without a permission prompt', closed ? 'won' : 'active', 'note-' + DEAL_ID, 'lena']].concat(t.where) }) : t));
    }
    if (closed) {
      const prompt = preds.filter((p) => p.tag === 'prompt' && p.raised)[0];
      const watch = preds.filter((p) => !p.raised && TAGS[p.tag] && TAGS[p.tag].issue).map((p) => {
        if (p.tag === 'partial') return { t: 'Staging partials', d: 'They’ll test IDComply in staging. Point them to the preset partial-result test profile.', fix: 'partial', src: 'support-partial' };
        if (p.tag === 'dates') return { t: 'UK date format', d: 'Confirm the date format at setup.', fix: 'dates', src: 'support-dates' };
        if (p.tag === 'oneapi') return { t: 'One API', d: 'A similar deal stalled when it got four separate integration docs. Send one combined guide.', src: 'note-NV-184' };
        return { t: TAGS[p.tag].label, d: 'Seen on similar deals. Raise it early.', src: 'deal-' + DEAL_ID };
      });
      D.pods.unshift({
        id: DEAL_ID, ini: 'RM', name: deal.name, industry: deal.vertical, closed: 'Today', bought: deal.products.join(', '), owner: 'jordan', base: 'new',
        during: prompt ? [{ t: 'Permission prompt', how: assigned ? 'Maya Chen joined the next call and walked them through the Stawks.io fix.' : 'Raised on the scoping call. Not resolved before close.', open: !assigned, src: 'note-' + DEAL_ID }] : [],
        expects: ['Location checked without a permission prompt for their users', 'Stop overseas sellers posing as local ones'],
        people: [{ ini: 'HT', name: 'Their head of trust', role: 'Found us through an AI assistant’s vendor list.' }],
        watch,
        team: assigned ? [['lena', 'sales'], ['maya', 'engineering']] : [['lena', 'sales']]
      });
    }
    return D;
  }

  renderVals() {
    const v = this.platformVals();
    v.liveCls = 'ld' + (this.state.conn ? ' on' : '');
    v.liveText = this.state.conn ? 'Live from Salesforce' : 'Synced with Salesforce';
    return v;
  }

  platformVals() {
    const st = this.state;
    const D = this.liveData();
    const set = (o) => this.setState(o);
    const ME = { ini: 'MC', name: 'Maya Chen', first: 'Maya' };
    const KIND = { now: 'Stuck now', likely: 'Potential stick', done: 'Resolved', solved: 'Solved' };
    const route = (r, id, from) => () => { set({ engRoute: r, engId: id || '', fixFrom: from || '', drawerKind: '', drawerId: '' }); this.top(); };

    // ---------- people, sources, products ----------
    const person = (key) => { const p = D.PEOPLE[key]; return { key, ini: p[0], name: p[1], first: p[1].split(' ')[0], role: p[2], go: () => this.say('Opens a Slack message to ' + p[1] + '.') }; };
    const srcOf = (key) => {
      if (D.EXTERNAL[key]) return { label: D.EXTERNAL[key][0], external: true };
      if (D.SRC[key]) return Object.assign({ external: false }, D.SRC[key]);
      const kind = key.slice(0, 4);
      const id = key.slice(5);
      const r = D.DEALS[id];
      if (kind === 'note') return { external: false, kind: 'Salesforce rep note', title: r[0] + ', ' + id, when: r[2], speaker: 'Logged by ' + D.PEOPLE[r[6]][1], label: 'Rep note', ask: [r[6]], open: 'Open in Salesforce', lines: [r[5]] };
      return { external: false, kind: 'Salesforce deal record', title: r[0] + ', ' + id, when: r[2], speaker: r[1], label: 'Deal record', ask: [r[6]], open: 'Open in Salesforce', lines: ['Products discussed: ' + r[3] + '.', 'In their words: “' + r[4] + '”'] };
    };
    const openSrc = (key, fromPod) => () => {
      if (D.EXTERNAL[key]) { this.say(D.EXTERNAL[key][1]); return; }
      set({ drawerKind: 'source', drawerId: key, srcFrom: fromPod || '' });
    };
    const prods = (str) => {
      const items = [];
      const notes = [];
      str.split(',').map((s) => s.trim()).forEach((p) => {
        const core = /Core/.test(p);
        const geo = /GeoGuard/.test(p);
        const idc = /IDComply/.test(p);
        if (core || geo || idc) items.push({ name: p.replace('GeoComply ', ''), core, geo, idc });
        else notes.push(p);
      });
      return { items, note: notes.join(', '), hasNote: notes.length > 0 };
    };
    const daysOf = (d) => ({ text: d.days.split(',')[0] + ' days', stalled: d.days.indexOf('stalled') >= 0 });

    // ---------- shared status ----------
    const ownerOf = (d) => (st.assignee[d.id] ? ME : (d.owner ? person(d.owner) : null));
    const podState = (p) => {
      if (st.podStatus[p.id]) return st.podStatus[p.id];
      if (p.base === 'owner' && st.podAssigned) return 'new';
      return p.base;
    };
    const coveredOf = (t) => {
      if (t.base === 'product') return 'product';
      const c = st.covered[t.id] === undefined ? t.base === 'covered' : st.covered[t.id];
      return c ? 'covered' : 'open';
    };

    // ---------- teams ----------
    const engBadge = D.eng.filter((d) => d.col === 'now' && !ownerOf(d)).length;
    const podBadge = D.pods.filter((p) => podState(p) !== 'reviewed').length;
    const mktBadge = D.topics.filter((t) => coveredOf(t) === 'open').length;
    const teams = [['eng', 'Engineering', engBadge, 'stuck deals with no engineer'], ['pods', 'Pods', podBadge, 'handoffs to review'], ['mkt', 'Marketing', mktBadge, 'topics with no content']].map((t) => ({
      label: t[1], cls: 'team' + (st.team === t[0] ? ' on' : ''), cur: st.team === t[0] ? 'page' : undefined,
      hasBadge: t[2] > 0, badge: String(t[2]), badgeTitle: t[2] + ' ' + t[3],
      pick: () => { const o = { team: t[0], drawerKind: '', drawerId: '' }; if (t[0] === 'pods') o.podRoute = 'list'; if (t[0] === 'eng') o.engRoute = 'deals'; set(o); this.top(); }
    }));

    // ================= ENGINEERING =================
    const tabOn = st.engRoute === 'fix' && !st.fixFrom ? 'library' : (st.engRoute === 'deal' || st.engRoute === 'fix' ? 'deals' : st.engRoute);
    const engTabs = [['deals', 'Deals', D.eng.length], ['library', 'Fix library', Object.keys(D.FIX).length]].map((t) => ({ label: t[1], n: String(t[2]), cls: 'seg' + (tabOn === t[0] ? ' on' : ''), pick: route(t[0]) }));
    const COLS = [['now', 'Stuck now'], ['likely', 'Potential stick'], ['done', 'Resolved']];
    const board = COLS.map((c) => {
      const cards = D.eng.filter((d) => d.col === c[0]).map((d) => {
        const o = ownerOf(d);
        return {
          name: d.name, industry: d.industry, stage: d.stageShort, cls: 'card ' + d.col + (d.demo ? ' fresh' : ''),
          issues: d.issues.map((i) => ({ t: D.ISSUE[i[0]].short, mk: 'mk ' + i[1], sr: KIND[i[1]] })),
          hasOwner: !!o, noOwner: !o, ownerIni: o ? o.ini : '', ownerName: o ? o.name : '', noEngText: d.demo && d.requested ? 'Engineer requested' : 'No engineer yet', open: route('deal', d.id)
        };
      });
      return { name: c[1], n: String(cards.length), cards, empty: cards.length === 0 };
    });
    const appliesTo = (fid) => D.eng.filter((d) => d.col !== 'done' && d.issues.some((i) => D.ISSUE[i[0]].fixes.indexOf(fid) >= 0));
    const library = Object.keys(D.FIX).map((fid) => {
      const f = D.FIX[fid];
      const a = appliesTo(fid);
      const nowN = a.filter((d) => d.issues.some((i) => i[1] === 'now' && D.ISSUE[i[0]].fixes.indexOf(fid) >= 0)).length;
      return {
        title: f.title, summary: f.summary, solvedFor: f.used[0][1], n: String(a.length),
        nLabel: a.length === 1 ? 'open deal could use this' : 'open deals could use this',
        hasNow: nowN > 0, nowNote: nowN + ' stuck now', open: route('fix', fid)
      };
    });

    // deal page
    const dd = D.eng.filter((x) => x.id === st.engId)[0] || D.eng[0];
    const ddOwner = ownerOf(dd);
    const ae = person(D.DEALS[dd.id][6]);
    const dpr = prods(dd.products);
    const ddays = daysOf(dd);
    const dp = {
      name: dd.name, id: dd.id, industry: D.DEALS[dd.id][1], hs: 'hs ' + dd.col, statusSr: KIND[dd.col],
      quote: '“' + D.DEALS[dd.id][4] + '”', stage: dd.stage,
      daysLabel: dd.col === 'done' ? 'Won in' : 'Open', daysText: ddays.text, stalled: ddays.stalled,
      prods: dpr.items,
      hasOwner: !!ddOwner, noOwner: !ddOwner, ownerIni: ddOwner ? ddOwner.ini : '', ownerName: ddOwner ? ddOwner.name : '',
      aeIni: ae.ini, aeName: ae.name, aeAsk: ae.go,
      openSf: () => this.say('Opens ' + dd.name + ' (' + dd.id + ') in Salesforce.'),
      assign: () => this.assignDeal(dd.id),
      issuesTitle: dd.col === 'done' ? 'What it got stuck on' : 'What it’s stuck on',
      issues: dd.issues.map((i) => {
        const iss = D.ISSUE[i[0]];
        const s = srcOf(i[3]);
        const who = person(s.ask[0]);
        return {
          cls: 'panel ' + (i[1] === 'solved' ? 'done' : i[1]), st: KIND[i[1]], name: iss.short, why: i[2],
          srcLabel: s.label, srcOpen: openSrc(i[3]), askName: 'Ask ' + who.first, askGo: who.go,
          fixes: iss.fixes.map((fid) => ({ title: D.FIX[fid].title, summary: D.FIX[fid].summary, solvedFor: 'Solved for ' + D.FIX[fid].used[0][1], open: route('fix', fid, dd.id) })),
          noFix: iss.fixes.length === 0, estimate: iss.estimate || ''
        };
      })
    };

    // fix page
    const fid = D.FIX[st.engId] ? st.engId : 'prompt';
    const ff = D.FIX[fid];
    const from = st.fixFrom ? D.eng.filter((x) => x.id === st.fixFrom)[0] : null;
    const fdeals = appliesTo(fid).map((d) => {
      const i = d.issues.filter((y) => D.ISSUE[y[0]].fixes.indexOf(fid) >= 0)[0];
      return { name: d.name, industry: d.industry, st: KIND[i[1]], cls: 'mini ' + i[1], rank: i[1] === 'now' ? 0 : 1, open: route('deal', d.id) };
    }).sort((x, y) => x.rank - y.rank);
    const fp = {
      title: ff.title, by: ff.by, summary: ff.summary, problem: ff.problem, fix: ff.fix, resultLabel: ff.resultLabel, result: ff.result,
      solvedFor: ff.used[0][1], nUsed: ff.used.length + (ff.used.length === 1 ? ' account' : ' accounts'),
      nDeals: String(fdeals.length), nDealsLabel: fdeals.length === 1 ? 'open deal' : 'open deals',
      askFirst: person(ff.ask[0]).name,
      c1: from ? 'Deals' : 'Fix library', c1Go: from ? route('deals') : route('library'),
      hasC2: !!from, c2: from ? from.name : '', c2Go: from ? route('deal', from.id) : () => {},
      sources: ff.sources.map((k) => ({ t: srcOf(k).label, open: openSrc(k) })),
      ask: ff.ask.map(person),
      openConf: () => this.say('Opens the full write-up, “' + ff.title + '”, in Confluence.'),
      deals: fdeals, noDeals: fdeals.length === 0,
      used: ff.used.map((u) => ({ name: u[1], kind: u[2] }))
    };

    // ================= PODS =================
    const PSL = { new: 'New', owner: 'Needs an owner', reviewed: 'Reviewed' };
    const podFilters = [['all', 'All', D.pods.length], ['todo', 'To review', D.pods.filter((p) => podState(p) !== 'reviewed').length]].map((f) => ({ label: f[1], n: String(f[2]), cls: 'seg' + (st.podFilter === f[0] ? ' on' : ''), pick: () => set({ podFilter: f[0] }) }));
    const ownerOfPod = (p) => (p.owner ? person(p.owner) : (st.podAssigned ? person('jordan') : null));
    const openPod = (id) => () => { set({ podRoute: 'deal', podId: id, drawerKind: '', drawerId: '' }); this.top(); };
    const podRows = D.pods.filter((p) => st.podFilter === 'all' || podState(p) !== 'reviewed').map((p) => {
      const o = ownerOfPod(p);
      const ps = podState(p);
      const b = prods(p.bought);
      const n = p.watch.length;
      return {
        name: p.name, industry: p.industry, closed: p.closed, prods: b.items, hasNote: b.hasNote, note: b.note,
        hasOwner: !!o, noOwner: !o, ownerIni: o ? o.ini : '', owner: o ? o.name : '',
        st: PSL[ps], cls: 'prow ' + ps,
        watch: n ? n + (n === 1 ? ' thing to watch for' : ' things to watch for') : 'Nothing to watch for', watchDots: p.watch.map(() => ({})),
        open: openPod(p.id)
      };
    });
    const pd = D.pods.filter((x) => x.id === st.podId)[0] || D.pods[0];
    let hp = {};
    {
      const o = ownerOfPod(pd);
      const ps = podState(pd);
      const pae = person(D.DEALS[pd.id][6]);
      const b = prods(pd.bought);
      hp = {
        name: pd.name, id: pd.id, industry: D.DEALS[pd.id][1], hs: 'hs ' + (ps === 'owner' ? 'now' : (ps === 'reviewed' ? 'done' : 'new')), statusSr: PSL[ps],
        quote: '“' + D.DEALS[pd.id][4] + '”', closed: pd.closed, sector: pd.industry, prods: b.items, hasNote: b.hasNote, note: b.note,
        hasOwner: !!o, noOwner: !o, ownerIni: o ? o.ini : '', ownerName: o ? o.name : '',
        canReview: !!o && ps !== 'reviewed', reviewed: ps === 'reviewed',
        openSf: () => this.say('Opens ' + pd.name + ' (' + pd.id + ') in Salesforce.'),
        assign: () => { set({ podAssigned: true }); this.say('You now own ' + pd.name + '.'); },
        review: () => { set({ podStatus: Object.assign({}, st.podStatus, { [pd.id]: 'reviewed' }) }); this.say('Marked as reviewed.'); },
        unreview: () => set({ podStatus: Object.assign({}, st.podStatus, { [pd.id]: 'new' }) }),
        during: pd.during.map((x) => {
          const isOpen = !!x.open && !st.podAssigned;
          return { t: x.t, how: x.open && st.podAssigned ? 'Solved: you now own the account.' : x.how, st: isOpen ? 'Still open' : 'Solved', cls: 'drow' + (isOpen ? ' open' : ''), srcLabel: srcOf(x.src).label, srcOpen: openSrc(x.src, pd.id) };
        }),
        noDuring: pd.during.length === 0,
        expects: pd.expects.map((t) => ({ t })),
        people: pd.people, noPeople: pd.people.length === 0,
        watch: pd.watch.map((w) => ({ t: w.t, d: w.d, hasFix: !!w.fix, srcLabel: srcOf(w.src).label, srcOpen: openSrc(w.src, pd.id), go: w.fix ? () => { set({ team: 'eng', engRoute: 'fix', engId: w.fix, fixFrom: '', drawerKind: '', drawerId: '' }); this.top(); } : () => {} })),
        noWatch: pd.watch.length === 0,
        team: pd.team.map((t) => { const p = person(t[0]); return { ini: p.ini, name: p.name, role: p.role, go: p.go }; })
      };
    }

    // ================= SOURCE PANEL =================
    let sp = { show: false, kind: '', when: '', title: '', back: false, backName: '', goBack: () => {}, isQuote: false, hasSpeaker: false, speaker: '', lines: [], ask: [], openFull: () => {}, openLabel: '' };
    if (st.drawerKind === 'source' && st.drawerId) {
      const s = srcOf(st.drawerId);
      const backPod = st.srcFrom ? D.pods.filter((x) => x.id === st.srcFrom)[0] : null;
      sp = {
        show: true, kind: s.kind, when: s.when, title: s.title,
        back: !!backPod, backName: backPod ? backPod.name : '', goBack: () => set({ drawerKind: '', drawerId: '', srcFrom: '' }),
        isQuote: s.kind === 'Meeting transcript',
        hasSpeaker: !!s.speaker, speaker: s.speaker || '',
        lines: s.lines.map((t) => ({ t })),
        ask: s.ask.map(person),
        openLabel: s.open, openFull: () => this.say(s.open === 'Open in Salesforce' ? 'Opens the record in Salesforce.' : 'Opens the full transcript and recording.')
      };
    }

    // ================= MARKETING =================
    const OUTC = { lost: ['Lost', '#FF6000'], stalled: ['Stalled', '#FF6000'], active: ['Open deal', '#003FF2'], won: ['Won', '#8FA6FF'], customer: ['Customer', '#D3DEFF'] };
    const SEGS = [['lost', 'Lost or stalled', '#FF6000'], ['active', 'Open deal', '#003FF2'], ['won', 'Won', '#8FA6FF'], ['customer', 'Existing customer', '#D3DEFF']];
    const segKey = (o) => (o === 'stalled' ? 'lost' : o);
    const COV = { covered: 'Has content', open: 'No content yet', product: 'Product gap, not content' };
    const COLS2 = ['Fintech', 'Consumer apps', 'Media & events', 'Health', 'Government', 'Charity'];
    const SHADE = ['background: transparent; box-shadow: inset 0 0 0 1px rgba(143,166,255,0.35)', 'background: #D3DEFF; color: #0033BD', 'background: #8FA6FF; color: #0A003C', 'background: #003FF2; color: #FFFFFF'];
    const maxN = Math.max.apply(null, D.topics.map((t) => t.where.length));
    const bars = D.topics.map((t) => {
      const on = st.mktSel === t.id;
      const cv = coveredOf(t);
      return {
        q: t.q, n: String(t.where.length), cls: 'mrow' + (on ? ' on' : ''), pressed: on ? 'true' : 'false', pick: () => set({ mktSel: t.id }),
        covCls: 'cov ' + cv, covTitle: COV[cv],
        segs: SEGS.map((sg) => {
          const n = t.where.filter((w) => segKey(w[4]) === sg[0]).length;
          return { n, t: sg[1] + ': ' + n, style: 'width: ' + (n / maxN * 100) + '%; background: ' + sg[2] };
        }).filter((sg) => sg.n > 0),
        cells: COLS2.map((c) => {
          const n = t.where.filter((w) => w[2] === c).length;
          return { n: n ? String(n) : '', style: SHADE[Math.min(n, 3)], title: c + ': ' + n };
        })
      };
    });
    const legend = SEGS.map((sg) => ({ t: sg[1], style: 'background: ' + sg[2] }));
    const covLegend = ['covered', 'open', 'product'].map((k) => ({ cls: 'cov ' + k, t: COV[k] }));
    const heatCols = COLS2.map((c) => ({ t: c }));
    const firstGap = D.topics.filter((t) => coveredOf(t) === 'open')[0];
    let gap = { has: false, none: true, q: '', meta: '', go: () => {} };
    if (firstGap) {
      const lost = firstGap.where.filter((w) => w[4] === 'lost' || w[4] === 'stalled').length;
      gap = {
        has: true, none: false, q: '“' + firstGap.q + '”',
        meta: 'Raised in ' + firstGap.where.length + ' deals' + (lost ? ', ' + lost + ' of them lost or stalled' : '') + '. Nothing to send them yet.',
        go: () => set({ mktSel: firstGap.id })
      };
    }
    const ts = D.topics.filter((t) => t.id === st.mktSel)[0] || D.topics[0];
    const tsCov = coveredOf(ts);
    const sel = {
      q: ts.q, n: ts.where.length + (ts.where.length === 1 ? ' deal raised this' : ' deals raised this'),
      where: ts.where.map((w) => {
        const who = person(w[6]);
        return { cls: 'qcard' + (w[5] === 'note-NV-083' ? ' fresh' : ''), name: w[1], industry: w[2], quote: w[3], out: OUTC[w[4]][0], dot: 'background: ' + OUTC[w[4]][1], srcLabel: srcOf(w[5]).label, srcOpen: openSrc(w[5]), ask: 'Ask ' + who.first, askGo: who.go };
      }),
      canCover: tsCov === 'open', isCovered: tsCov === 'covered', isProduct: tsCov === 'product',
      cover: () => { set({ covered: Object.assign({}, st.covered, { [ts.id]: true }) }); this.say('Marked as covered.'); },
      uncover: () => set({ covered: Object.assign({}, st.covered, { [ts.id]: false }) })
    };

    const page = st.team;
    return {
      teams, isEng: page === 'eng', isPods: page === 'pods', isMkt: page === 'mkt',
      engTabs, board, library, dp, fp,
      engList: st.engRoute === 'deals' || st.engRoute === 'library',
      engTitle: st.engRoute === 'library' ? 'Fix library' : 'Deals',
      engSub: st.engRoute === 'library' ? 'Problems we’ve already solved, and the open deals that could use each fix.' : 'Open deals that are stuck, or could get stuck, on something technical.',
      engDeals: st.engRoute === 'deals', engLibrary: st.engRoute === 'library', engDeal: st.engRoute === 'deal', engFix: st.engRoute === 'fix',
      toDeals: route('deals'),
      podFilters, podRows, hp, podList: st.podRoute !== 'deal', podPage: st.podRoute === 'deal',
      toHandoffs: () => { set({ podRoute: 'list', drawerKind: '', drawerId: '' }); this.top(); },
      drawerOpen: sp.show, closeDrawer: () => set({ drawerKind: '', drawerId: '', srcFrom: '' }), sp,
      gap, bars, legend, covLegend, heatCols, sel,
      hasToast: st.toast !== '', toast: st.toast
    };
  }
}
