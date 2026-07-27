import { THEMES, WAYS, DEFAULT_THEME, DEFAULT_WAY, STORAGE_KEY } from "./themes";

/**
 * The theme applied before the first paint.
 *
 * This has to be a string of source injected into `<head>` and run
 * synchronously. Anything deferred — an effect, a module, even a `defer`
 * script — paints the default theme first and then flips, which is the flash
 * every theme system is judged by.
 *
 * That constraint is also why the token data is inlined rather than imported:
 * the script runs before any bundle has loaded. It is generated from the same
 * `THEMES` and `WAYS` the rest of the app uses, so the two cannot drift.
 */
export function themeScript(): string {
  // Only what the script needs, so the inlined blob stays small.
  const themes = THEMES.map((t) => ({
    n: t.name,
    f: t.fill,
    w: !!t.ways,
    p: t.paper ?? null,
    bl: t.bgLight,
    bd: t.bgDark,
    bs: t.bgSize,
    l: t.light,
    d: t.dark,
  }));
  const ways = WAYS.map((w) => ({ n: w.name, f: w.fill, a: w.accLight }));

  return `(function(){try{
var T=${JSON.stringify(themes)},W=${JSON.stringify(ways)};
var raw=null;try{raw=localStorage.getItem(${JSON.stringify(STORAGE_KEY)})}catch(e){}
var c={};try{c=raw?JSON.parse(raw):{}}catch(e){}
var t=T.filter(function(x){return x.n===c.theme})[0]||T.filter(function(x){return x.n===${JSON.stringify(DEFAULT_THEME)}})[0];
var w=W.filter(function(x){return x.n===c.way})[0]||W.filter(function(x){return x.n===${JSON.stringify(DEFAULT_WAY)}})[0];
var m=c.mode;
if(m!=="light"&&m!=="dark"){m=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}
var p=m==="dark"?t.d:t.l;
var fill=t.w?w.f:t.f;
var acc=m==="dark"?fill:(t.w?w.a:p.acc);
function mix(a,b,k){function q(h,i){return parseInt(h.slice(i,i+2),16)}
function c2(x,y){return Math.round(x+(y-x)*k).toString(16).padStart(2,"0")}
return "#"+c2(q(a,1),q(b,1))+c2(q(a,3),q(b,3))+c2(q(a,5),q(b,5))}
var r=document.documentElement,s=r.style;
s.setProperty("--ground",p.ground);
s.setProperty("--shell-ink",p.ink);
s.setProperty("--shell-body",p.body);
s.setProperty("--shell-muted",p.muted);
s.setProperty("--shell-rule",p.rule);
s.setProperty("--fill",fill);
s.setProperty("--fill-text",acc);
s.setProperty("--fill-tint",mix(fill,"#FFFFFF",0.81));
s.setProperty("--ground-bg",m==="dark"?t.bd:t.bl);
s.setProperty("--ground-bg-size",t.bs);
s.setProperty("--paper",(m==="dark"&&t.p)?t.p:"#FFFFFF");
r.setAttribute("data-mode",m);
r.setAttribute("data-theme-name",t.n);
}catch(e){}})();`;
}
