import { SendMessageWithContent } from '../utils/discord.js'
import { FriendsOfRiskRequest } from '../utils/friends-of-risk.js'
import { GetGame, RemoveAllPlayersInGame, SetGame } from '../utils/redis.js'
import { VOTE_VALUES, NOT_PLAYED_VOTE_THRESHOLD, REQUIRED_VOTES_BY_PLAYER_COUNT } from '../constants.js'

export default async function WinnerSelection(gameId, playerId, winnerId) {
  let game = await GetGame(gameId)

  if (game.winner) {
    return false
  }

  game.winnerVotes[playerId] = winnerId

  game = await SetGame(gameId, game)

  const voteCount = Object.keys(game.winnerVotes).length
  const requiredVotes = REQUIRED_VOTES_BY_PLAYER_COUNT[game.playerCount]

  // Count "not played" votes
  const notPlayedVotes = Object.values(game.winnerVotes).filter(
    (vote) => vote === VOTE_VALUES.NOT_PLAYED
  ).length

  // If multiple players voted "not played", end the game without a winner
  if (notPlayedVotes >= NOT_PLAYED_VOTE_THRESHOLD) {
    await Promise.all([
      SendMessageWithContent(
        gameId,
        `Multiple players indicated the game was not played. The game has been ended without recording a winner.`
      ),
      RemoveAllPlayersInGame(gameId),
    ])
    return true
  }

  if (voteCount >= requiredVotes) {
    console.log(`Votes: ${JSON.stringify(game.winnerVotes)}`)

    // Filter out "not played" votes when determining winner
    const playerVotes = Object.values(game.winnerVotes).filter(
      (vote) => vote !== VOTE_VALUES.NOT_PLAYED
    )
    const winner = determineWinner(playerVotes, requiredVotes)

    if (winner === null && voteCount === game.playerCount) {
      await SendMessageWithContent(
        gameId,
        `Winner could not be determined, nobody received a majority of votes.  Current votes: \n${Object.entries(
          game.winnerVotes
        )
          .map(
            ([voter, winner]) =>
              `- Voter: <@${voter}> -> Winner: ${winner === VOTE_VALUES.NOT_PLAYED ? 'Game not played' : `<@${winner}>`}`
          )
          .join('\n')}`
      )
    } else if (winner !== null) {
      const response = await addGameToFriendsOfRisk(
        gameId,
        game.selectedSettingId,
        game.players,
        winner
      )
      if (!response.ok) {
        return false
      }
      game.winner = winner
      game = await SetGame(gameId, game)

      await Promise.all([
        SendMessageWithContent(
          gameId,
          `Congratulations to the winner <@${winner}>!  The game has been stored on FriendsOfRisk, you should see the results live shortly.`
        ),
        RemoveAllPlayersInGame(gameId),
      ])
    }
  } else {
    await pingRemainingVotes(gameId)
  }

  return true
}

async function pingRemainingVotes(gameId) {
  const game = await GetGame(gameId)
  const alreadyVoted = Object.keys(game.winnerVotes)
  const remainingVoters = game.players.filter(
    (playerId) => !alreadyVoted.includes(playerId)
  )

  await SendMessageWithContent(
    gameId,
    `${remainingVoters.map((voterId) => `<@${voterId}> `)}\nDon't forget to vote for the winner with the selection menu above!`
  )
}

function determineWinner(votes, requiredToWinCount) {
  let voteCounts = {}
  for (let vote of votes) {
    voteCounts[vote] = (voteCounts[vote] || 0) + 1
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
    const playerNumber = i + 1
    body[`player${playerNumber}`] = playerId
    body[`player${playerNumber}score`] = playerId === winnerId ? 1 : 0
  })

  return await FriendsOfRiskRequest('addgame', {
    method: 'POST',
    body: body,
  })
}
