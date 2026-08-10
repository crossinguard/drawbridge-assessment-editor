import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';

/*
  Serves `build/` the way Netlify serves it.

  `vite preview` is NOT that. It runs SvelteKit's own preview server, which
  re-renders the SPA fallback per request with asset paths relative to the depth of
  the URL you asked for. A real static host has one `200.html` file and hands back
  exactly those bytes whatever the path — and the two behave differently in ways that
  matter to a service worker.

  Stage 11 is the stage that has to trust its own preview, so this is a plain static
  server with the two rules from netlify.toml and nothing else: serve the file if it
  exists, otherwise serve 200.html with a 200, and never let sw.js be cached.

  No dependencies, and it reads from disk per request — so a rebuild is picked up by
  a refresh instead of needing the server restarted.
*/

const root = resolve('build');
const port = Number(process.env.PORT ?? 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.zip': 'application/zip'
};

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/**
 * The file a path maps to, or null when nothing matches and the fallback should
 * take over.
 *
 * `/help` has to find `help.html`, because that is what a prerendered route is
 * written as and what Netlify resolves it to. Without that step every prerendered
 * page but the root would fall through to the SPA fallback here and still work,
 * which is exactly the kind of "works locally, differently" that this server exists
 * to avoid.
 *
 * Anything resolving outside `build/` returns null rather than an error: a traversal
 * attempt is not a case worth distinguishing from a miss.
 */
async function fileFor(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const candidate = resolve(join(root, decoded));
  if (candidate !== root && !candidate.startsWith(root + sep)) return null;

  if (await isFile(candidate)) return candidate;
  if (await isFile(`${candidate}.html`)) return `${candidate}.html`;

  const index = join(candidate, 'index.html');
  return (await isFile(index)) ? index : null;
}

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? '/', `http://${request.headers.host}`).pathname;

  const file = (await fileFor(pathname)) ?? join(root, '200.html');

  let body;
  try {
    body = await readFile(file);
  } catch {
    response.writeHead(404, { 'Content-Type': TYPES['.txt'] });
    response.end('Not found. Run `pnpm build` first.\n');
    return;
  }

  response.writeHead(200, {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    // netlify.toml's one caching rule: an install pinned to a stale service worker
    // stops picking up new builds. Everything else is uncached here because the
    // point of this server is to show you the build you just made.
    'Cache-Control': pathname === '/sw.js' ? 'public, max-age=0, must-revalidate' : 'no-store'
  });
  response.end(request.method === 'HEAD' ? undefined : body);
});

server.listen(port, () => {
  console.log(`Serving build/ like a static host on http://localhost:${port}`);
});
