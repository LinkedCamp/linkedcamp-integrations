'use strict';

// Live read-only smoke test. Runs only when LINKEDCAMP_TEST_API_KEY is set
// (test sub-account key). Never prints the key or response bodies.
const zapier = require('zapier-platform-core');
const App = require('../index');

const key = process.env.LINKEDCAMP_TEST_API_KEY;
const appTester = zapier.createAppTester(App);
const live = key ? describe : describe.skip;

live('live smoke (read-only)', () => {
  const bundle = () => ({ authData: { api_key: key }, inputData: {}, meta: {} });
  jest.setTimeout(90000);

  it('whoami', async () => {
    const me = await appTester(App.authentication.test, bundle());
    expect(me && typeof me).toBe('object');
  });

  it('campaign_list', async () => {
    const out = await appTester(App.triggers.new_campaign.operation.perform, bundle());
    expect(Array.isArray(out)).toBe(true);
    out.forEach((c) => expect(c.id).toBeTruthy());
  });

  it('lead_list', async () => {
    const out = await appTester(App.searches.find_lead.operation.perform, { ...bundle(), inputData: { keyword: 'a', pageSize: 5 } });
    expect(Array.isArray(out)).toBe(true);
  });
});
