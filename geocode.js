// Node entry point: reads the GeoNames extract from disk and hands it to the
// shared core. No network calls at runtime.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createGeocoder } from './core.js';

const DATA = new URL('./data/', import.meta.url);
const read = (f) => {
  let buf;
  try {
    buf = readFileSync(new URL(f, DATA));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    throw new Error(`Missing data/${f}. Run: npm run build-data`);
  }
  return (f.endsWith('.gz') ? gunzipSync(buf) : buf).toString('utf8');
};

export const { lookup, localitiesOf, cityIndexAt, placeCount } = createGeocoder({
  places: read('places.tsv.gz'),
  admin1: read('admin1CodesASCII.txt'),
  admin2: read('admin2Codes.txt'),
  countries: read('countryInfo.txt'),
});
