import { SendMessageWithContent } from "../utils/discord.js";
import { FriendsOfRiskRequest } from "../utils/friends-of-risk.js";
import { GetGame, SetGame } from "../utils/redis.js";

export default async function WinnerSelection(gameId, playerId, winnerId) {
  let game = await GetGame(gameId)

  const preVoteCount = Object.keys(game.winnerVotes).length

  if (preVoteCount > (game.playerCount / 2)) {
    return false
  }
  
  game.winnerVotes[playerId] = winnerId
  
  game = await SetGame(gameId, game)

  const voteCount = Object.keys(game.winnerVotes).length
  
  if (voteCount > (game.playerCount / 2)) {
    console.log(`Votes: ${JSON.stringify(game.winnerVotes)}`)
    const winner = determineWinner(Object.values(game.winnerVotes))

    const response = await addGameToFriendsOfRisk(gameId, game.selectedSettingId, game.players, winnerId)
    if (!response.ok) {
      return false
    }

    await SendMessageWithContent(gameId, `Congratulations to the winner <@${winner}>!  The game has been stored on FriendsOfRisk, you shoudl see the results live shortly.`)
  } else {
    await pingRemainingVotes(gameId)
  }

  return true
}

async function pingRemainingVotes(gameId) {
  const game = await GetGame(gameId)
  const alreadyVoted = Object.keys(game.winnerVotes)
  const remainingVoters = game.players.filter((playerId) => !alreadyVoted.includes(playerId))

  await SendMessageWithContent(gameId, `${remainingVoters.map((voterId) => `<@${voterId}> `)}\nDon't forget to vote for the winner with the selection menu above!`)
}

// TODO: fix this so it requires _majority for same person_
function determineWinner(votes) {
  let voteCounts = {}
  let maxCount = 0
  let winner = null
  for(let vote of votes) {
    voteCounts[vote] = (voteCounts[vote] || 0) + 1;
    if (voteCounts[vote] > maxCount) {
      maxCount = voteCounts[vote]
      winner = vote
    }
  }

  return winner
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

  return await FriendsOfRiskRequest('addgame', {
    method: 'POST',
    body: body
  })
}
