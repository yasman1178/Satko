const fs = require('fs');
const path = require('path');

function patchFile(p, replacements) {
  if (!fs.existsSync(p)) return;
  let code = fs.readFileSync(p, 'utf8');
  for (const [regex, replacement] of replacements) {
    code = code.replace(regex, replacement);
  }
  fs.writeFileSync(p, code);
}

// 1. Patch load-manifest.external.js to resolve projectDir/distDir fallback
patchFile('node_modules/next/dist/server/load-manifest.external.js', [
  [
    'const manifestPath = (0, _path.join)(/* turbopackIgnore: true */ projectDir, distDir, manifest);',
    'let manifestPath = (0, _path.join)(/* turbopackIgnore: true */ projectDir, distDir, manifest); if (!(0, _fs.existsSync)(manifestPath)) { const alt = (0, _path.join)(process.cwd(), \".next\", manifest); if ((0, _fs.existsSync)(alt)) manifestPath = alt; }'
  ]
]);

// 2. Patch html-context.shared-runtime to share context across bundle boundaries
patchFile('node_modules/next/dist/shared/lib/html-context.shared-runtime.js', [
  [
    /const HtmlContext = \(0, _react\.createContext\)\(undefined\);/,
    `globalThis.__NEXT_HTML_CONTEXT__ = globalThis.__NEXT_HTML_CONTEXT__ || (0, _react.createContext)(undefined); const HtmlContext = globalThis.__NEXT_HTML_CONTEXT__;`
  ],
  [
    /if \(!context\) \{\s*throw Object\.defineProperty\(new Error\("<Html> should not be imported outside of pages\/_document/,
    `if (!context) { return {}; } if (false) { throw Object.defineProperty(new Error("<Html> should not be imported outside of pages/_document`
  ]
]);

patchFile('node_modules/next/dist/esm/shared/lib/html-context.shared-runtime.js', [
  [
    /export const HtmlContext = createContext\(undefined\);/,
    `globalThis.__NEXT_HTML_CONTEXT__ = globalThis.__NEXT_HTML_CONTEXT__ || createContext(undefined); export const HtmlContext = globalThis.__NEXT_HTML_CONTEXT__;`
  ],
  [
    /if \(!context\) \{\s*throw Object\.defineProperty\(new Error\("<Html> should not be imported outside of pages\/_document/,
    `if (!context) { return {}; } if (false) { throw Object.defineProperty(new Error("<Html> should not be imported outside of pages/_document`
  ]
]);

// 3. Patch compiled next-server runtimes
[
  'node_modules/next/dist/compiled/next-server/pages.runtime.prod.js',
  'node_modules/next/dist/compiled/next-server/pages.runtime.dev.js',
  'node_modules/next/dist/compiled/next-server/pages-turbo.runtime.prod.js',
  'node_modules/next/dist/compiled/next-server/pages-turbo.runtime.dev.js'
].forEach(p => {
  patchFile(p, [
    [/throw Object\.defineProperty\(new Error\(.[^;]*no-document-import-in-page.[^;]*\)/g, 'return {}']
  ]);
});

// 4. Patch entries.js to resolve relative appPaths for rootNotFound
patchFile('node_modules/next/dist/build/entries.js', [
  [
    /validFileMatcher\.isRootNotFound\(absolutePath\)/g,
    `(validFileMatcher.isRootNotFound(absolutePath) || validFileMatcher.isRootNotFound(_path.join(appDir, absolutePath)))`
  ]
]);
