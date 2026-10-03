import { defineConfig, loadEnv } from 'vite';

/**
 * Serve `netlify/functions/ask.mjs` from the dev server.
 *
 * The Ask panel POSTs to `/api/ask`, which only exists via the Netlify redirect
 * in netlify.toml. Plain `vite` has no such route, so without this middleware
 * the request 404s and every answer silently falls back to dictionary-only
 * synthesis — making a working LLM integration look broken in development.
 */
function netlifyFunctionDevServer(env) {
  return {
    name: 'netlify-functions-dev',
    apply: 'serve',
    configureServer(server) {
      // The function reads credentials from process.env, like Netlify does.
      for (const [key, value] of Object.entries(env)) {
        if (process.env[key] === undefined) process.env[key] = value;
      }

      server.middlewares.use('/api/ask', async (req, res) => {
        try {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const raw = Buffer.concat(chunks).toString('utf8');

          const request = new Request(`http://${req.headers.host || 'localhost'}/api/ask`, {
            method: req.method,
            headers: { 'content-type': req.headers['content-type'] || 'application/json' },
            body: req.method === 'GET' || req.method === 'HEAD' ? undefined : raw,
          });

          const { default: handler } = await server.ssrLoadModule('/netlify/functions/ask.mjs');
          const response = await handler(request);

          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) {
          server.config.logger.error(`[ask] ${error?.stack || error}`);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: 'function_failed' }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // '' prefix: load every key in .env, not just VITE_-prefixed ones.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [netlifyFunctionDevServer(env)],
    server: {
      port: 5173,
      open: false,
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
    },
  };
});
