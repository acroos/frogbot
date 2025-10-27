import { VOTE_VALUES } from '../constants.js'
import { SendMessageWithContent } from '../utils/discord.js'
import { ReportScore } from '../utils/friends-of-risk.js'
import {
  RemoveAllPlayersInGame,
  AtomicVoteWinner,
  SetGame,
} from '../utils/redis.js'

/**
 * Handles a player's winner selection vote
 * @param {string} gameId - The Discord thread ID of the game
 * @param {string} playerId - The Discord user ID of the voting player
 * @param {string} winnerId - The Discord user ID of the winner or VOTE_VALUES.NOT_PLAYED
 * @returns {Promise<boolean>} True if vote was accepted, false if game already has a winner
 */
export default async function WinnerSelection(gameId, playerId, winnerId) {
  // ATOMIC OPERATION: Vote for winner using Redis transaction
  const result = await AtomicVoteWinner(gameId, playerId, winnerId)

  if (!result.success) {
    console.log(
      `Winner vote failed for player ${playerId} in game ${gameId}: ${result.error}`
    )
    return result.error === 'Game already has a winner' ? false : true
  }

  const updatedGame = result.game

  if (result.shouldFinalize) {
    // Handle different finalization scenarios
    if (result.reason === 'not_played') {
      await Promise.all([
        SendMessageWithContent(
          gameId,
          `Multiple players indicated the game was not played. The game has been ended without recording a winner.`
        ),
        RemoveAllPlayersInGame(gameId),
      ])
    } else if (result.reason === 'no_majority') {
      await SendMessageWithContent(
        gameId,
        `Winner could not be determined, nobody received a majority of votes.  Current votes: \n${Object.entries(
          updatedGame.winnerVotes
        )
          .map(
            ([voter, winner]) =>
              `- Voter: <@${voter}> -> Winner: ${winner === VOTE_VALUES.NOT_PLAYED ? 'Game not played' : `<@${winner}>`}`
          )
          .join('\n')}`
      )
    } else if (result.reason === 'winner_determined') {
      const winner = updatedGame.winner

      // Check if winner has already been submitted to Friends of Risk
      if (updatedGame.winnerSubmittedToFriendsOfRisk) {
        console.log(
          `Winner for game ${gameId} has already been submitted to Friends of Risk, skipping`
        )
        await SendMessageWithContent(
          gameId,
          `Winner <@${winner}> has already been submitted to Friends of Risk.`
        )
        return true
      }

      const response = await ReportScore(
        gameId,
        updatedGame.selectedSettingId,
        updatedGame.players,
        winner
      )
      if (!response.ok) {
        return false
      }

      // Mark as submitted to prevent duplicates
      updatedGame.winnerSubmittedToFriendsOfRisk = true

      // Save winner and notify in parallel
      await Promise.all([
        RemoveAllPlayersInGame(gameId),
        SetGame(gameId, updatedGame),
        SendMessageWithContent(
          gameId,
          `Congratulations to the winner <@${winner}>!  The game has been stored on FriendsOfRisk, you should see the results live shortly.`
        ),
      ])
    }
  } else {
    // Still waiting for more votes
    await pingRemainingVotes(updatedGame)
  }

  return true
}

/**
 * Pings players who haven't voted yet for winner
 * @param {Object} game - The game object
 * @returns {Promise<void>}
 */
async function pingRemainingVotes(game) {
  const alreadyVoted = Object.keys(game.winnerVotes)
  const remainingVoters = game.players.filter(
    (playerId) => !alreadyVoted.includes(playerId)
  )

  await SendMessageWithContent(
    game.gameThreadId,
    `${remainingVoters.map((voterId) => `<@${voterId}> `)}\nDon't forget to vote for the winner with the selection menu above!`
  )
}
