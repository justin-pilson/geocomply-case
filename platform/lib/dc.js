// Tiny renderer for the page templates.
// The page markup lives in <template id="tpl"> and uses {{value}} holes, <sc-if value="{{x}}"> and <sc-for list="{{xs}}" as="x">.
// A component class returns the values from renderVals(); setState() re-renders, and morphdom patches only what changed.
(function () {
  let comp = null;
  let tpl = null;
  let root = null;
  let handlers = [];
  let pending = false;

  function lookup(path, scopes) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    const parts = path.split('.');
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (parts[0] in scopes[i]) {
        let cur = scopes[i][parts[0]];
        for (const p of parts.slice(1)) cur = cur == null ? undefined : cur[p];
        return cur;
      }
    }
    return undefined;
  }
  const HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  const ONLY = /^\{\{\s*([^}]+?)\s*\}\}$/;
  function interp(s, scopes) {
    return s.replace(HOLE, (m, p) => {
      const v = lookup(p, scopes);
      return v === undefined || v === null || typeof v === 'function' ? '' : String(v);
    });
  }
  function build(node, scopes, out) {
    if (node.nodeType === 3) { out.appendChild(document.createTextNode(interp(node.textContent, scopes))); return; }
    if (node.nodeType !== 1) return;
    const tag = node.localName;
    if (tag === 'sc-if') {
      if (lookup(node.getAttribute('value').replace(/[{}]/g, ''), scopes)) node.childNodes.forEach((c) => build(c, scopes, out));
      return;
    }
    if (tag === 'sc-for') {
      const list = lookup(node.getAttribute('list').replace(/[{}]/g, ''), scopes) || [];
      const as = node.getAttribute('as');
      list.forEach((item) => node.childNodes.forEach((c) => build(c, scopes.concat([{ [as]: item }]), out)));
      return;
    }
    const el = document.createElementNS(node.namespaceURI, tag);
    for (const a of node.attributes) {
      if (a.name === 'onclick') {
        const m = a.value.match(ONLY);
        const fn = m ? lookup(m[1], scopes) : null;
        if (typeof fn === 'function') el.setAttribute('data-h', String(handlers.push(fn) - 1));
        continue;
      }
      const only = a.value.match(ONLY);
      if (only) {
        const v = lookup(only[1], scopes);
        if (v === undefined || v === null) continue;
      }
      el.setAttribute(a.name, interp(a.value, scopes));
    }
    node.childNodes.forEach((c) => build(c, scopes, el));
    out.appendChild(el);
  }
  function render() {
    pending = false;
    handlers = [];
    const vals = comp.renderVals();
    const fresh = document.createElement('div');
    tpl.content.childNodes.forEach((n) => build(n, [vals], fresh));
    window.morphdom(root, fresh, { childrenOnly: true });
  }
  window.DCLogic = class {
    constructor(props) { this.props = props || {}; this.state = {}; }
    setState(o) {
      Object.assign(this.state, typeof o === 'function' ? o(this.state) : o);
      if (!pending) { pending = true; requestAnimationFrame(render); }
    }
  };
  window.mount = function (Cls) {
    tpl = document.getElementById('tpl');
    root = document.getElementById('root');
    comp = new Cls({});
    root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-h]');
      if (el && root.contains(el)) {
        const h = handlers[Number(el.getAttribute('data-h'))];
        if (h) h(e);
      }
    });
    render();
    if (comp.componentDidMount) comp.componentDidMount();
    window.app = comp;
  };
})();
