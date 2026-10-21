import { buildApp } from './build-app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = await buildApp({ config });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'shutting down');
    // Stop accepting connections and let in-flight requests finish.
    app.close().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  });
}

// Not awaited: Vercel Functions intercept listen(), and blocking module evaluation
// on it there keeps the function from ever starting.
app.listen({ port: config.port, host: config.host }).catch((err: unknown) => {
  app.log.fatal({ err }, 'failed to start');
  process.exit(1);
});
