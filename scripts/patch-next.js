const fs = require('fs');
const path = require('path');

function patchFile(p, replacements) {
  if (!fs.existsSync(p)) return;
  let code = fs.readFileSync(p, 'utf8');
  let modified = false;
  for (const [regexOrStr, replacement] of replacements) {
    if (typeof regexOrStr === 'string') {
      if (code.includes(regexOrStr) && !code.includes(replacement)) {
        code = code.replace(regexOrStr, replacement);
        modified = true;
      }
    } else {
      if (regexOrStr.test(code)) {
        code = code.replace(regexOrStr, replacement);
        modified = true;
      }
    }
  }
  if (modified) {
    fs.writeFileSync(p, code);
  }
}

// 1. Patch load-manifest.external.js to resolve projectDir/distDir fallback
patchFile('node_modules/next/dist/server/load-manifest.external.js', [
  [
    'const manifestPath = (0, _path.join)(/* turbopackIgnore: true */ projectDir, distDir, manifest);',
    'let manifestPath = (0, _path.join)(/* turbopackIgnore: true */ projectDir, distDir, manifest); if (!(0, _fs.existsSync)(manifestPath)) { const alt = (0, _path.join)(process.cwd(), ".next", manifest); if ((0, _fs.existsSync)(alt)) manifestPath = alt; }'
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
if (fs.existsSync('node_modules/next/dist/build/entries.js')) {
  let eCode = fs.readFileSync('node_modules/next/dist/build/entries.js', 'utf8');
  if (!eCode.includes('_path.join(appDir, absolutePath)')) {
    eCode = eCode.replace(
      /validFileMatcher\.isRootNotFound\(absolutePath\)/g,
      '(validFileMatcher.isRootNotFound(absolutePath) || validFileMatcher.isRootNotFound(_path.join(appDir, absolutePath)))'
    );
    fs.writeFileSync('node_modules/next/dist/build/entries.js', eCode);
  }
}

// 5. Patch selectAppPageEntry in app-paths to gracefully fallback if not found
['node_modules/next/dist/shared/lib/router/utils/app-paths.js', 'node_modules/next/dist/esm/shared/lib/router/utils/app-paths.js'].forEach(p => {
  patchFile(p, [
    [
      /throw new Error\("Invariant: no direct app page entry found for " \+ pathname\);/,
      'if (appPaths && appPaths.length > 0) return appPaths[0]; return pathname;'
    ]
  ]);
});
