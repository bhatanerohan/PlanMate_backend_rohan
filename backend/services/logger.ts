import fs from 'fs';
import path from 'path';

export function startCapture(prompt: string) {
  // Ensure outputs dir is created relative to repository root `backend/outputs`
  // Some environments have process.cwd() set to project root or backend; normalize both
  const repoRoot = process.cwd();
  let outputsDir = path.join(repoRoot, 'backend', 'outputs');
  // If that would create a duplicate 'backend/backend' when cwd is already backend, fix it
  if (repoRoot.endsWith(path.sep + 'backend') || repoRoot.endsWith('/backend')) {
    outputsDir = path.join(repoRoot, 'outputs');
  }
  try {
    if (!fs.existsSync(outputsDir)) fs.mkdirSync(outputsDir, { recursive: true });
  } catch (e) {
    // ignore
  }

  const safeName = String(prompt).replace(/[^a-z0-9-_ ]/gi, '_').slice(0, 100);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${timestamp}__${safeName}.txt`;
  const filepath = path.join(outputsDir, filename);

  try {
    fs.writeFileSync(filepath, `User Prompt: ${prompt}\n\n`);
  } catch (e) {
    // ignore
  }

  const orig = {
    log: console.log.bind(console),
    error: console.error.bind(console),
    warn: console.warn.bind(console),
    info: (console as any).info ? (console as any).info.bind(console) : console.log.bind(console)
  };

  const append = (level: string, args: any[]) => {
    try {
      const text = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
      fs.appendFileSync(filepath, `[${new Date().toISOString()}] ${level.toUpperCase()} ${text}\n`);
    } catch (e) {
      // ignore
    }
  };

  console.log = (...args: any[]) => { append('log', args); orig.log(...args); };
  console.error = (...args: any[]) => { append('error', args); orig.error(...args); };
  console.warn = (...args: any[]) => { append('warn', args); orig.warn(...args); };
  (console as any).info = (...args: any[]) => { append('info', args); orig.info(...args); };

  // Return a function that stops capture and also provide an appendRaw helper
  const stop = function stopCapture(summary?: string) {
    try {
      console.log = orig.log;
      console.error = orig.error;
      console.warn = orig.warn;
      (console as any).info = orig.info;
    } catch (e) {}

    try {
      if (summary) fs.appendFileSync(filepath, `\n--- Summary ---\n${summary}\n`);
    } catch (e) {}

    return filepath;
  };

  // Helper to append raw objects (e.g., Gemini responses) in readable form
  const appendRaw = (label: string, obj: any) => {
    try {
      const util = require('util');
      const text = typeof obj === 'string' ? obj : util.inspect(obj, { depth: null, colors: false });
      fs.appendFileSync(filepath, `\n[${new Date().toISOString()}] RAW ${label}\n${text}\n`);
    } catch (e) {
      // ignore
    }
  };

  // Attach appendRaw to the stop function for external use
  (stop as any).appendRaw = appendRaw;

  return stop;
}


