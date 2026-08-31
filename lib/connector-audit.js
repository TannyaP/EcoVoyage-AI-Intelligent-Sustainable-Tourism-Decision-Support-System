const CONNECTORS = ['OpenWeather', 'WAQI', 'OpenStreetMap'];

function connectorSummary(readings) {
  const summary = Object.fromEntries(CONNECTORS.map(name => [name, { success: 0, failed: 0, notConfigured: 0 }]));
  for (const reading of readings) {
    for (const name of CONNECTORS) {
      const status = reading.connectorStatus?.[name];
      if (status === 'success') summary[name].success += 1;
      else if (status === 'failed') summary[name].failed += 1;
      else if (status === 'not-configured') summary[name].notConfigured += 1;
    }
  }
  return summary;
}

module.exports = { CONNECTORS, connectorSummary };
