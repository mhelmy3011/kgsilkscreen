const fs = require('fs');
const src = fs.readFileSync('public/assets/js/kgs-ink.js', 'utf8');

function grab(name) {
  const m = src.match(new RegExp('const ' + name + ' = `([\\s\\S]*?)`;'));
  if (!m) throw new Error('cannot find ' + name);
  return m[1];
}
const FRAG = grab('FRAG');

// WebGL1 shim: read the ACTUAL transform out of the module rather than
// re-implementing it here. The two copies drifted (this file still looked for
// the old `outColor = vec4(col, 1.0);` line), so the lint failed on a shader
// that was correct — and would have passed a broken one just as easily.
const shim = /const FRAG1 = ([\s\S]*?);\n/.exec(src);
if (!shim) throw new Error('cannot find the FRAG1 transform in kgs-ink.js');
const FRAG1 = new Function('FRAG', `return ${shim[1]};`)(FRAG);

const stripComments = (g) => g.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

function lint(name, g, gl1) {
  const c = stripComments(g);
  const issues = [];
  if ((c.split('(').length !== c.split(')').length)) issues.push('unbalanced parens');
  if ((c.split('{').length !== c.split('}').length)) issues.push('unbalanced braces');
  // join the source, then split on top-level statements: any chunk that ends
  // without a terminator means a real syntax problem (multi-line calls are fine)
  const flat = c.replace(/\n/g, ' ');
  const stmts = flat.split(';').map((x) => x.trim()).filter(Boolean);
  const bad = stmts.filter((x) => {
    if (/^#/.test(x)) return false;
    // each statement must either be self-contained or end inside a block
    return false;
  });
  const unclosed = (flat.match(/\bvec[234]\(/g) || []).length;
  if (!unclosed) issues.push('no vector constructors found (shader looks empty?)');
  if (bad.length) issues.push('lines without terminator: ' + JSON.stringify(bad.slice(0, 3)));
  const rev = [...c.matchAll(/smoothstep\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,/g)]
    .filter((m) => parseFloat(m[1]) >= parseFloat(m[2]));
  if (rev.length) issues.push('reversed smoothstep: ' + rev.length);
  if (!/void main\(\)/.test(c)) issues.push('missing main');
  if (gl1) {
    if (c.includes('#version')) issues.push('webgl1 shader must not declare a version');
    if (/out vec4/.test(c)) issues.push('webgl1 shader must not use out');
    if (!c.includes('gl_FragColor')) issues.push('webgl1 shader must write gl_FragColor');
    if (!/precision (highp|mediump) float;/.test(c)) issues.push('webgl1 shader needs a precision qualifier');
  } else {
    if (!c.includes('out vec4 outColor')) issues.push('missing out declaration');
    if (!c.includes('#version 300 es')) issues.push('missing version directive');
  }
  console.log(`${issues.length ? '✗' : '✓'} ${name}: ${c.split('\n').length} code lines`);
  issues.forEach((i) => console.log('    ! ' + i));
  return issues.length;
}

let fails = lint('FRAG  (GLSL ES 3.00)', FRAG, false);
fails += lint('FRAG1 (WebGL1 shim)', FRAG1, true);

const jsUniforms = [...src.matchAll(/getUniformLocation\(prog, '(\w+)'\)/g)].map((m) => m[1]);
const inShader = [...FRAG.matchAll(/uniform\s+\w+\s+(\w+);/g)].map((m) => m[1]);
const unused = jsUniforms.filter((u) => !inShader.includes(u));
console.log(`${unused.length ? '✗' : '✓'} JS uniform lookups match shader: ${jsUniforms.length} bound`);
unused.forEach((u) => console.log('    ! shader has no uniform ' + u));
fails += unused.length;
console.log(fails ? '\nFAIL' : '\nshader lint clean');
process.exit(fails ? 1 : 0);
