/** Vercel serverless entry — re-exports the Express app as the handler. */
import { createApp } from '../src/app.js';

export default createApp();
