import { ReportScore } from '../utils/friends-of-risk.js';

const args = process.argv.slice(2);
if (args.length !== 4) {
  console.error('Usage: node report-score.js <gameId> <settingsId> <playerIdsCommaSeparated> <winnerId>');
  process.exit(1);
}

const [gameId, settingsId, playerIdsCsv, winnerId] = args;
const playerIds = playerIdsCsv.split(',');

ReportScore(gameId, settingsId, playerIds, winnerId)
  .then(async response => {
    if (response.ok) {
      console.log('Score reported successfully.');
      const json = await response.json();
      console.log(`Message update response: ${JSON.stringify(json)}`);
    } else {
      console.error(`Failed to report score: ${response.statusText}`);
    }
  })
  .catch(error => {
    console.error(`Error reporting score: ${error.message}`);
  });
  