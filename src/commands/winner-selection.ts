import { SendMessageWithContent } from '../utils/discord.js'
import { FriendsOfRiskRequest } from '../utils/friends-of-risk.ts'
import { GetGame, RemoveAllPlayersInGame, SetGame } from '../utils/redis.js'
import {
  VOTE_VALUES,
  NOT_PLAYED_VOTE_THRESHOLD,
  REQUIRED_VOTES_BY_PLAYER_COUNT,
} from '../constants.js'
import type { Game } from '../types/game.ts'

/**
 * Handles a player's winner selection vote
 * @param gameId - The Discord thread ID of the game
 * @param playerId - The Discord user ID of the voting player
 * @param winnerId - The Discord user ID of the winner or VOTE_VALUES.NOT_PLAYED
 * @returns True if vote was accepted, false if game already has a winner
 */
export default async function WinnerSelection(
  gameId: string,
  playerId: string,
  winnerId: string
): Promise<boolean> {
  const gameData = await GetGame(gameId)
  const game = gameData as Game

  if (game.winner) {
    return false
  }

  game.winnerVotes[playerId] = winnerId
  await SetGame(gameId, game)

  const voteCount = Object.keys(game.winnerVotes).length
  const requiredVotes =
    REQUIRED_VOTES_BY_PLAYER_COUNT[
      game.playerCount as keyof typeof REQUIRED_VOTES_BY_PLAYER_COUNT
    ]

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
      if (!game.selectedSettingId) {
        throw new Error('No settings selected for game')
      }
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

      // Save winner and notify in parallel
      await Promise.all([
        SetGame(gameId, game),
        SendMessageWithContent(
          gameId,
          `Congratulations to the winner <@${winner}>!  The game has been stored on FriendsOfRisk, you should see the results live shortly.`
        ),
        RemoveAllPlayersInGame(gameId),
      ])
    }
  } else {
    await pingRemainingVotes(game)
  }

  return true
}

/**
 * Pings players who haven't voted yet for winner
 * @param game - The game object
 */
async function pingRemainingVotes(game: Game): Promise<void> {
  const alreadyVoted = Object.keys(game.winnerVotes)
  const remainingVoters = game.players.filter(
    (playerId) => !alreadyVoted.includes(playerId)
  )

  await SendMessageWithContent(
    game.gameThreadId,
    `${remainingVoters.map((voterId) => `<@${voterId}> `)}\nDon't forget to vote for the winner with the selection menu above!`
  )
}

/**
 * Determines the winner from votes based on required vote count
 * @param votes - Array of player IDs that received votes
 * @param requiredToWinCount - Number of votes required to win
 * @returns The winner's player ID or null if no winner
 */
function determineWinner(votes: string[], requiredToWinCount: number): string | null {
  const voteCounts: Record<string, number> = {}
  for (const vote of votes) {
    voteCounts[vote] = (voteCounts[vote] || 0) + 1
    if (voteCounts[vote] >= requiredToWinCount) {
      return vote
    }
  }

  return null
}

/**
 * Submits game results to Friends of Risk API
 * @param gameId - The game thread ID
 * @param settingsId - The settings ID used for the game
 * @param playerIds - Array of player IDs
 * @param winnerId - The winner's player ID
 * @returns The API response
 */
async function addGameToFriendsOfRisk(
  gameId: string,
  settingsId: string,
  playerIds: string[],
  winnerId: string
): Promise<Response> {
  const body: Record<string, string> = {
    messageid: gameId,
    settingsid: settingsId,
  }

  playerIds.forEach((playerId: string, i) => {
    const playerNumber = i + 1
    body[`player${playerNumber}`] = playerId
    body[`player${playerNumber}score`] = playerId === winnerId ? '1' : '0'
  })

  return await FriendsOfRiskRequest('addgame', {
    method: 'POST',
    body: body,
  })
}
