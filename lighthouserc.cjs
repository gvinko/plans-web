module.exports = { ci: {
  collect: { startServerCommand: 'npm run preview -- --host 127.0.0.1 --port 4174', url: ['http://127.0.0.1:4174/'], numberOfRuns: 1, settings: { chromeFlags: '--headless --no-sandbox' } },
  assert: { assertions: { 'categories:performance': ['error', { minScore: 0.8 }], 'categories:accessibility': ['error', { minScore: 0.9 }], 'categories:best-practices': ['error', { minScore: 0.9 }] } },
  upload: { target: 'filesystem', outputDir: '.lighthouseci/reports' },
} };
