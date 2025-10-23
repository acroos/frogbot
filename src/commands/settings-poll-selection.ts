import { GetGame, SetGame } from '../utils/redis.js'
import { SendMessageWithContent } from '../utils/discord.js'
import { sendStartGameMessage } from '../utils/utils.js'
import type { Game } from '../types/game.ts'

/**
 * Handles a player's vote for game settings
 * @param gameId - The Discord thread ID of the game
 * @param playerId - The Discord user ID of the voting player
 * @param selectionId - The ID of the selected setting
 * @returns True if vote was counted, false if settings already finalized
 */
export default async function SettingsPollSelectionMade(
  gameId: string,
  playerId: string,
  selectionId: string
): Promise<boolean> {
  // Fetch game once at the start
  const gameData = await GetGame(gameId)
  const game = gameData as Game

  // Validate that the game is not already finalized
  const votes = Object.values(game.settingsVotes)
  if (votes.length === game.playerCount) {
    return false
  }

  // Add the vote to the game
  const settingsChoice = game.settingsOptions.find(
    (option) => option.settingid === selectionId
  )
  if (settingsChoice) {
    game.settingsVotes[playerId] = settingsChoice
  }
  await SetGame(gameId, game)

  // Check if we should finalize
  const updatedVotes = Object.values(game.settingsVotes)
  if (updatedVotes.length === game.playerCount) {
    // Finalize settings - randomly select from votes
    const selectedSettings =
      updatedVotes[Math.floor(Math.random() * updatedVotes.length)]
    if (!selectedSettings) {
      throw new Error('No settings selected')
    }
    game.selectedSettingId = selectedSettings.settingid
    await SetGame(gameId, game)

    console.log(`Finalized settings: ${JSON.stringify(selectedSettings)}`)
    await sendStartGameMessage(game, selectedSettings)
  } else {
    await pingRemainingVotes(game)
  }

  return true
}

/**
 * Pings players who haven't voted yet
 * @param game - The game object
 */
async function pingRemainingVotes(game: Game): Promise<void> {
  const alreadyVoted = Object.keys(game.settingsVotes)
  const remainingVoters = game.players.filter(
    (playerId) => !alreadyVoted.includes(playerId)
  )

  await SendMessageWithContent(
    game.gameThreadId,
    `${remainingVoters.map((voterId) => `<@${voterId}> `)}\nDon't forget to vote for your preferred settings with the selection menu above!`
  )
}
