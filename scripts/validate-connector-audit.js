const { connectorSummary } = require('../lib/connector-audit');

const summary = connectorSummary([
  { connectorStatus: { OpenWeather: 'success', WAQI: 'failed', OpenStreetMap: 'success' } },
  { connectorStatus: { OpenWeather: 'not-configured', WAQI: 'not-configured', OpenStreetMap: 'failed' } }
]);

if (summary.OpenWeather.success !== 1 || summary.OpenWeather.notConfigured !== 1 || summary.WAQI.failed !== 1 || summary.OpenStreetMap.failed !== 1) throw new Error('Connector audit aggregation failed.');
console.log('Connector audit aggregation validated.');
