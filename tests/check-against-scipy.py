"""Compares the engine's numbers with SciPy on the same cleaned data. Run: python3 tests/check-against-scipy.py <ab_data.csv> <cookie_cats.csv>"""
import json, subprocess, sys
import pandas as pd
from scipy import stats
ab, cc = sys.argv[1], sys.argv[2]
def engine(demo, settings):
    js = f"""const ER=require('./engine.js');const d=require('./data/{demo}');console.log(JSON.stringify(ER.readout(d.summary,{json.dumps(settings)})));"""
    return json.loads(subprocess.check_output(['node', '-e', js]))
ok = True
def check(name, a, b, tol):
    global ok
    good = abs(a - b) <= tol; ok &= good
    print(('PASS' if good else 'FAIL'), name, round(a, 6), round(b, 6))
base = dict(alpha=0.05, minLift=0.01, guardrailTol=0.01, srmAlpha=0.01, plannedShare=0.5)
# Landing page: drop mismatches and all rows of duplicated users, as the engine does
df = pd.read_csv(ab)
df = df[(df.group == 'treatment') == (df.landing_page == 'new_page')]
raw = pd.read_csv(ab); dups = raw.user_id[raw.user_id.duplicated(keep=False)].unique()
df = df[~df.user_id.isin(dups)]
g = df.groupby('group').converted.agg(['sum', 'count'])
r = engine('demo-landing-page.json', dict(base, primary='converted', guardrails=[]))
p = stats.chi2_contingency([[g.loc[k, 'sum'], g.loc[k, 'count'] - g.loc[k, 'sum']] for k in ['control', 'treatment']], correction=False)[1]
check('landing p-value', r['primary']['p'], p, 1e-4)
check('landing control rate', r['primary']['meanA'], g.loc['control', 'sum'] / g.loc['control', 'count'], 1e-9)
check('landing SRM p', r['srm']['p'], stats.chisquare(g['count'].values)[1], 1e-4)
# Cookie Cats
c = pd.read_csv(cc)
r = engine('demo-cookie-cats.json', dict(base, primary='retention_7', guardrails=['retention_1', 'sum_gamerounds']))
check('cookie SRM p', r['srm']['p'], stats.chisquare(c.version.value_counts().values)[1], 1e-4)
g = c.groupby('version').retention_7.agg(['sum', 'count'])
p = stats.chi2_contingency([[g.loc[k, 'sum'], g.loc[k, 'count'] - g.loc[k, 'sum']] for k in ['gate_30', 'gate_40']], correction=False)[1]
check('cookie retention_7 p', r['primary']['p'], p, 1e-4)
w = stats.ttest_ind(c[c.version == 'gate_40'].sum_gamerounds, c[c.version == 'gate_30'].sum_gamerounds, equal_var=False)
gr = [x for x in r['guards'] if x['metric'] == 'sum_gamerounds'][0]
check('cookie game rounds p (Welch)', gr['p'], w.pvalue, 2e-3)
print('ALL PASS' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
