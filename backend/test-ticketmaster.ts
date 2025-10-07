// backend/test-ticketmaster.ts
// Standalone script to test Ticketmaster API
// Usage:
//   node test-ticketmaster.ts --keyword "concert" --city "Boston" --date "this weekend" --limit 5
// Or set env var TICKETMASTER_API_KEY and run:
//   node test-ticketmaster.ts

async function parseArgs() {
  const args = process.argv.slice(2);
  const parsed: Record<string, string> = {};
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

function promptInput(question: string): Promise<string> {
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
    const args = await parseArgs();

    const apiKey = process.env.TICKETMASTER_API_KEY || process.env.TM_API_KEY;
    if (!apiKey) {
      console.error('Missing TICKETMASTER_API_KEY environment variable.');
      console.error('Set it and re-run, or run `export TICKETMASTER_API_KEY=your_key` (Linux/macOS) or set in Windows env.');
      process.exit(1);
    }

    const keyword = args.keyword || (await promptInput('Keyword (e.g. concert) (leave empty to search by location only):')) || '';
    const city = args.city || (await promptInput('City (e.g. Boston):')) || 'Boston';
    const date = args.date || (await promptInput('Date (e.g. today, this weekend, 2025-10-10) (optional):')) || '';
    const limitStr = args.limit || (await promptInput('Limit (number, default 10):')) || '10';
    const limit = parseInt(limitStr, 10) || 10;

    // Build Ticketmaster API params
    const params: Record<string, string> = {
      apikey: apiKey,
      city,
      size: String(limit)
    };
    // If keyword provided, include it; otherwise we will rely on location-only search
    if (keyword) {
      params.keyword = keyword;
    }
    if (date) {
      // We'll pass date as startDateTime for simple testing; advanced parsing is left to the user
      params.startDateTime = date;
    }

    console.log('\n➡️ Ticketmaster request params:\n' + JSON.stringify(params, null, 2) + '\n');

    const query = new URLSearchParams(params as Record<string, string>);
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
    console.error('Error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
})();


