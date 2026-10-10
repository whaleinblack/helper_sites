import { createApp, loadConfig } from './app.mjs';

const config = loadConfig();
const { server } = await createApp(config);
server.listen(config.port, config.host, () => {
  console.log(`chufa-drive listening on http://${config.host}:${config.port}${config.base}/`);
});
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close();
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
