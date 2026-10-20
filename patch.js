const fs = require('fs');

function patchFile(p) {
  if (!fs.existsSync(p)) return;
  let code = fs.readFileSync(p, 'utf8');
  if (code.includes('globalThis.__NEXT_HTML_CONTEXT__')) return;
  code = code.replace(
    /const HtmlContext = \(0, _react\.createContext\)\(undefined\);/,
    `globalThis.__NEXT_HTML_CONTEXT__ = globalThis.__NEXT_HTML_CONTEXT__ || (0, _react.createContext)(undefined); const HtmlContext = globalThis.__NEXT_HTML_CONTEXT__;`
  );
  code = code.replace(
    /export const HtmlContext = createContext\(undefined\);/,
    `globalThis.__NEXT_HTML_CONTEXT__ = globalThis.__NEXT_HTML_CONTEXT__ || createContext(undefined); export const HtmlContext = globalThis.__NEXT_HTML_CONTEXT__;`
  );
  code = code.replace(
    /if \(!context\) \{\s*throw Object\.defineProperty\(new Error\("<Html> should not be imported outside of pages\/_document/,
    `if (!context) { return {}; } if (false) { throw Object.defineProperty(new Error("<Html> should not be imported outside of pages/_document`
  );
  fs.writeFileSync(p, code);
  console.log('Patched', p);
}

patchFile('node_modules/next/dist/shared/lib/html-context.shared-runtime.js');
patchFile('node_modules/next/dist/esm/shared/lib/html-context.shared-runtime.js');

// Also patch entries.js isRootNotFound relative path issue
const entriesPath = 'node_modules/next/dist/build/entries.js';
if (fs.existsSync(entriesPath)) {
  let eCode = fs.readFileSync(entriesPath, 'utf8');
  eCode = eCode.replace(
    /validFileMatcher\.isRootNotFound\(absolutePath\)/g,
    `(validFileMatcher.isRootNotFound(absolutePath) || validFileMatcher.isRootNotFound(_path.default.join(appDir, absolutePath)))`
  );
  fs.writeFileSync(entriesPath, eCode);
  console.log('Patched', entriesPath);
}
