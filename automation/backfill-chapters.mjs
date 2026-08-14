// Automatic chapter backfill — pulls category/chapter data straight from
// Twitch (the same GQL endpoint the site itself uses) for every VOD that
// doesn't already have chapters cached, and pushes results to Firestore.
//
// Meant to run on a schedule (see ../.github/workflows/backfill-chapters.yml)
// so chapters get captured automatically while a VOD is still on Twitch —
// no one has to remember to open the site and run backfillAllChapters().
//
// This only ever talks to Twitch's own API and your own Firestore project.
// It does not touch SullyGnome, TwitchTracker, or any other third-party
// tracker — those sites ask not to be scraped, so nothing here does that.

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';

// ── Config ───────────────────────────────────────────────────────────────
// Twitch client id/secret: same ones already public in index.html's DEFAULTS.
// Fine to keep here directly, but env vars let you rotate them without a
// code change if you ever want to.
const TWITCH_CLIENT_ID     = process.env.TWITCH_CLIENT_ID     || '61x4q55vai9w0lwsc1enqw9vktqzee';
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || '4okb43u66gkj27to2vxqw6wewb4ohd';
const TWITCH_LOGIN         = 'shlbez';

// Twitch's own public web client id — used for the unauthenticated GQL
// chapters query, exactly like the browser does.
const GQL_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
const GQL_CHAPTERS_HASH = '71835d5ef425e154bf282453a926d99b328cdc5e32f36d3a209d0f4778b41203';

const CHAPTER_CLOUD_COLLECTION = 'chapterCache';
const firebaseConfig = {
  apiKey: 'AIzaSyBmd08FRwGlO0S4L-kwGKq3rLVcbtEUjpI',
  authDomain: 'shibezvods-4676a.firebaseapp.com',
  projectId: 'shibezvods-4676a',
  storageBucket: 'shibezvods-4676a.firebasestorage.app',
  messagingSenderId: '439862936787',
  appId: '1:439862936787:web:2fa966fec0987a95f6c026',
};

// ── Twitch helpers ───────────────────────────────────────────────────────
async function fetchTwitchToken() {
  const r = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
    { method: 'POST' }
  );
  const d = await r.json();
  if (!d.access_token) throw new Error('Twitch token failed: ' + JSON.stringify(d));
  return d.access_token;
}

async function fetchAllVodIds(token) {
  const ur = await fetch(`https://api.twitch.tv/helix/users?login=${TWITCH_LOGIN}`, {
    headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': 'Bearer ' + token },
  });
  const ud = await ur.json();
  if (!ud.data?.length) throw new Error('Twitch user not found: ' + TWITCH_LOGIN);
  const userId = ud.data[0].id;

  let vodIds = [], cursor = '';
  while (true) {
    const url = `https://api.twitch.tv/helix/videos?user_id=${userId}&first=100&type=archive${cursor ? '&after=' + cursor : ''}`;
    const vr = await fetch(url, { headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': 'Bearer ' + token } });
    const vd = await vr.json();
    if (!vd.data?.length) break;
    vodIds.push(...vd.data.map(v => v.id));
    cursor = vd.pagination?.cursor || '';
    if (!cursor) break;
  }
  return vodIds;
}

async function fetchTwitchChapters(vodId) {
  const query = {
    operationName: 'VideoPlayer_ChapterSelectButtonVideo',
    variables: { includePrivate: false, videoID: vodId },
    extensions: { persistedQuery: { version: 1, sha256Hash: GQL_CHAPTERS_HASH } },
  };
  const resp = await fetch('https://gql.twitch.tv/gql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Client-Id': GQL_CLIENT_ID },
    body: JSON.stringify([query]),
  });
  const data = await resp.json();
  const video = data?.[0]?.data?.video;
  if (!video) return [];

  const edges = video?.moments?.edges || video?.moments?.nodes?.map(n => ({ node: n })) || [];
  if (edges.length) {
    return edges
      .map(e => ({
        label: e.node?.details?.game?.displayName || e.node?.game?.displayName || e.node?.description || 'Unknown',
        t: Math.floor((e.node?.positionMilliseconds || 0) / 1000),
      }))
      .filter(c => c.label !== 'Unknown' || c.t > 0);
  }
  if (video?.game?.displayName) return [{ label: video.game.displayName, t: 0 }];
  return [];
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const auth = getAuth(app);
  await signInAnonymously(auth);

  console.log('Fetching Twitch token…');
  const token = await fetchTwitchToken();

  console.log('Listing VODs for', TWITCH_LOGIN, '…');
  const vodIds = await fetchAllVodIds(token);
  console.log(`Found ${vodIds.length} VOD(s) currently on Twitch.`);

  let fetched = 0, alreadyCached = 0, empty = 0, failed = 0;
  for (const vodId of vodIds) {
    try {
      const existing = await getDoc(doc(db, CHAPTER_CLOUD_COLLECTION, vodId));
      if (existing.exists() && existing.data()?.games?.length) {
        alreadyCached++;
        continue;
      }
      const games = await fetchTwitchChapters(vodId);
      if (games.length) {
        await setDoc(doc(db, CHAPTER_CLOUD_COLLECTION, vodId), { games, fetchedAt: Date.now(), source: 'auto-cron' });
        fetched++;
        console.log(`  ✓ ${vodId} — ${games.length} chapter(s)`);
      } else {
        empty++;
      }
    } catch (e) {
      failed++;
      console.warn(`  ✗ ${vodId} —`, e.message);
    }
    await new Promise(r => setTimeout(r, 150)); // be gentle with Twitch's API
  }

  console.log(`\nDone. Newly fetched: ${fetched}, already cached: ${alreadyCached}, no chapters available: ${empty}, failed: ${failed}.`);
  process.exit(0);
}

main().catch(e => {
  console.error('Backfill run failed:', e);
  process.exit(1);
});
