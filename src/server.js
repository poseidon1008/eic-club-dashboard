/** Local / Render entry point. Vercel uses api/index.js instead. */
import { createApp } from './app.js';

const port = process.env.PORT || 3000;
createApp().listen(port, () => {
  console.log(`EIC dashboard running at http://localhost:${port}`);
});
