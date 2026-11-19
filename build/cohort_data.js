// Precompute the A2 result with the same generator + SQL the page runs live.
// Usage: node build/cohort_data.js <path-to-sql.js-package-dir>
global.window = global; global.performance = require('perf_hooks').performance;
window.initSqlJs = require(require('path').join(process.argv[2], 'dist/sql-asm.js'));
eval(require('fs').readFileSync('site/sqldemo.js', 'utf8'));
(async () => {
  const db = await SQLDEMO.getDb();
  const pull = q => { const r = db.exec(q); return r.length ? r[r.length - 1].values : []; };
  const r = db.exec(SQLDEMO.Q.a2);
  const a2 = r[r.length - 1].values;
  require('fs').writeFileSync('site/a2_data.json', JSON.stringify(a2));
  console.log('a2 rows', a2.length, JSON.stringify(a2));
})();
