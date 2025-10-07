// Plain JS runner for Ticketmaster test (compiled from test-ticketmaster.ts logic)
// Usage:
//   node test-ticketmaster.js --keyword "concert" --city "Boston" --date "this weekend" --limit 5

// Load .env for ESM projects
import 'dotenv/config';
// require('dotenv').config();

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : '';
      if (val !== '') i++;
      parsed[key] = val;
    }
  }
  return parsed;
}

function promptInput(question) {
  return new Promise((resolve) => {
    process.stdout.write(question + ' ');
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', function (data) {
      process.stdin.pause();
      resolve(data.toString().trim());
    });
  });
}

(async function main() {
  try {
    const args = parseArgs();

    const apiKey = process.env.TICKETMASTER_API_KEY || process.env.TM_API_KEY;
    if (!apiKey) {
      console.error('Missing TICKETMASTER_API_KEY environment variable.');
      console.error('Set it and re-run.');
      process.exit(1);
    }

    const keyword = args.keyword || (await promptInput('Keyword (e.g. concert) (leave empty to search by location only):')) || '';
    const city = args.city || (await promptInput('City (e.g. Boston):')) || 'Boston';
    const date = args.date || (await promptInput('Date (e.g. today, this weekend, 2025-10-10) (optional):')) || '';
    const limitStr = args.limit || (await promptInput('Limit (number, default 10):')) || '10';
    const limit = parseInt(limitStr, 10) || 10;

    const params = {
      apikey: apiKey,
      city: city,
      size: String(limit)
    };
    if (keyword) params.keyword = keyword;
    if (date) params.startDateTime = date;

    console.log('\n➡️ Ticketmaster request params:\n' + JSON.stringify(params, null, 2) + '\n');

    const query = new URLSearchParams(params);
    const url = `https://app.ticketmaster.com/discovery/v2/events.json?${query.toString()}`;

    console.log('➡️ Request URL:\n' + url + '\n');

    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      console.error('Ticketmaster API returned error:', res.status, res.statusText);
      console.error('Body:', text);
      process.exit(1);
    }

    const json = await res.json();
    console.log('\n⬅️ Ticketmaster response:\n' + JSON.stringify(json, null, 2));

  } catch (err) {
    console.error('Error:', err && err.message ? err.message : String(err));
    process.exit(1);
  }
})();


