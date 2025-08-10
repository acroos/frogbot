import { LockThread, SendMessageWithContent } from "../utils/discord.js";
import { FriendsOfRiskRequest } from "../utils/friends-of-risk.js";
import { GetGame, RemoveAllPlayersInGame, RemovePlayerInGame, SetGame } from "../utils/redis.js";

// TODO:
// - Close thread
// - Remove game
// - Remove all players from "currently playing"
export default async function WinnerSelection(gameId, playerId, winnerId) {
  const requiredVotesMap = {
    4: 3,
    5: 3,
    6: 4
  }
  let game = await GetGame(gameId)

  if (game.winner) {
    return false
  }
  
  game.winnerVotes[playerId] = winnerId
  
  game = await SetGame(gameId, game)

  const voteCount = Object.keys(game.winnerVotes).length
  const requiredVotes = requiredVotesMap[game.playerCount]
  
  if (voteCount >= requiredVotes) {
    console.log(`Votes: ${JSON.stringify(game.winnerVotes)}`)
    const winner = determineWinner(Object.values(game.winnerVotes), requiredVotes)
    if (winner === null && voteCount === game.playerCount) {
      await SendMessageWithContent(gameId, `Winner could not be determined, nobody received a majority of votes.  Current votes: \n${Object.entries(game.winnerVotes).map(([voter, winner]) => `- Voter: <@${voter}> -> Winner: <@${winner}>`).join('\n')}`)
    } else if (winner !== null) {
      const response = await addGameToFriendsOfRisk(gameId, game.selectedSettingId, game.players, winnerId)
      if (!response.ok) {
        return false
      }
      game.winner = winner
      game.completedAt = Date.now()
      game = await SetGame(gameId, game)

      await Promise.all(
        SendMessageWithContent(gameId, `Congratulations to the winner <@${winner}>!  The game has been stored on FriendsOfRisk, you should see the results live shortly.`),
        RemoveAllPlayersInGame(gameId)
      )
    }
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

function determineWinner(votes, requiredToWinCount) {
  let voteCounts = {}
  for(let vote of votes) {
    voteCounts[vote] = (voteCounts[vote] || 0) + 1;
    if (voteCounts[vote] >= requiredToWinCount) {
      return vote
    }
  }

  return null
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
