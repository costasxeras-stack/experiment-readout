// Builds data/demo-*.json by running the app's own engine over the public CSV files.
// Usage: node scripts/build-demos.js <path to ab_data.csv> <path to cookie_cats.csv>
const fs = require('fs');
const ER = require('../engine.js');
const [abPath, ccPath] = process.argv.slice(2);
function build(path, mapping, meta, out) {
  const parsed = ER.parseCsv(fs.readFileSync(path, 'utf8'));
  const summary = ER.summarise(parsed, mapping);
  fs.writeFileSync(out, JSON.stringify({ meta, mapping, summary }));
  console.log(out, summary.rowsIn, 'rows in,', summary.cleanRows, 'clean');
}
build(abPath, { id: 'user_id', group: 'group', shown: 'landing_page', time: 'timestamp', metrics: ['converted'], control: 'control' },
  { title: 'Landing page test', source: 'Public teaching dataset of an e-commerce landing page test (Udacity Data Analyst course, January 2017). Licence not stated.', defaults: { primary: 'converted', guardrails: [] } },
  'data/demo-landing-page.json');
build(ccPath, { id: 'userid', group: 'version', metrics: ['retention_7', 'retention_1', 'sum_gamerounds'], control: 'gate_30' },
  { title: 'Mobile game gate test (Cookie Cats)', source: 'Public player-level data from the mobile game Cookie Cats by Tactile Entertainment, shared for teaching by DataCamp. Licence not stated.', defaults: { primary: 'retention_7', guardrails: ['retention_1', 'sum_gamerounds'] } },
  'data/demo-cookie-cats.json');
