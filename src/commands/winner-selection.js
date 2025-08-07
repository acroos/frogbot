import { SendMessageWithComponents, SendMessageWithContent } from "../utils/discord.js";
import { FriendsOfRiskRequest } from "../utils/friends-of-risk.js";
import { GetGame, SetGame } from "../utils/redis.js";

export default async function WinnerSelection(gameId, playerId, winnerId) {
  let game = await GetGame(gameId)
  
  game.winnerVotes[playerId] = winnerId
  
  game = await SetGame(gameId, game)
  console.log(`voter: ${playerId}; winner votes: ${JSON.stringify(game.winnerVotes)}`)

  const response = await addGameToFriendsOfRisk(gameId, game.selectedSettingId, game.players, winnerId)
    console.log(`FoR AddGame Response: ${JSON.stringify(response)}`)
    if (!response.ok) {
      return false
    }
  
  // if (Object.keys(game.winnerVotes).length === game.playerCount) {
  //   const selectedWinners = new Set(Object.values(game.winnerVotes))
  //   if (selectedWinners.length > 1) {
  //     SendMessageWithContent(gameId, `Winner not unanimous.  Votes: ${game.winnerVotes.map((voter, winner) => {
  //       return `Voter: <@${voter}>; Winner: <@${winner}>`
  //     }).join('\n')}`)
  //   }

  //   console.log(`Winner has been selected: ${winnerId}`)
  //   const response = await addGameToFriendsOfRisk(gameId, game.selectedSettingId, game.players, winnerId)
  //   console.log(`FoR AddGame Response: ${JSON.stringify(response)}`)
  //   if (!response.ok) {
  //     return false
  //   }
  // }

  return true
}

async function addGameToFriendsOfRisk(gameId, settingsId, playerIds, winnerId) {
  const body = {
    messageid: gameId,
    settingsid: settingsId,
  }

  playerIds.forEach((playerId, i) => {
    const playerNumber = i+1
    body[`player${playerNumber}`] = playerId
    body[`player${playerNumber}score`] = (playerId === winnerId) ? 1 : 0
  })

  body['player3'] = '656887038762549278'
  body['player3score'] = 0

  body['player4'] = '993730100401033317'
  body['player4score'] = 0

  console.log(`body: ${JSON.stringify(body)}`)

  const options = {
    method: 'POST',
    body: body
  }
  console.log(`Options: ${JSON.stringify(options)}`)
  return await FriendsOfRiskRequest('addgame', options)
}
