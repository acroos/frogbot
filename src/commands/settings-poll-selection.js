import { SendMessageWithContent } from '../utils/discord.js'
import { AtomicVoteSettings, GetGame } from '../utils/redis.js'
import { sendStartGameMessage } from '../utils/utils.js'

/**
 * Handles a player's vote for game settings
 * @param {string} threadId - The Discord thread ID of the game
 * @param {string} playerId - The Discord user ID of the voting player
 * @param {string} selectedSettingId - The ID of the selected setting
 * @returns {Promise<boolean>} True if vote was counted, false if settings already finalized
 */
export default async function SettingsPollSelectionMade(
  gameId,
  playerId,
  selectionId
) {
  // Fetch game to validate settings choice
  const game = await GetGame(gameId)
  if (!game) {
    return false
  }

  // Find the settings choice
  const settingsChoice = game.settingsOptions.find(
    (option) => option.settingid === selectionId
  )
  if (!settingsChoice) {
    console.error(
      `Invalid settings selection ${selectionId} for game ${gameId}`
    )
    return false
  }

  // ATOMIC OPERATION: Vote for settings using Redis transaction
  const result = await AtomicVoteSettings(gameId, playerId, settingsChoice)

  if (!result.success) {
    console.log(
      `Settings vote failed for player ${playerId} in game ${gameId}: ${result.error}`
    )
    return false
  }

  const updatedGame = result.game

  if (result.shouldFinalize) {
    // Settings have been finalized - send start game message
    const selectedSettings = updatedGame.settingsOptions.find(
      (option) => option.settingid === updatedGame.selectedSettingId
    )
    console.log(`Finalized settings: ${JSON.stringify(selectedSettings)}`)
    await sendStartGameMessage(updatedGame, selectedSettings)
  } else {
    // Still waiting for more votes
    await pingRemainingVotes(updatedGame)
  }

  return true
}

/**
 * Pings players who haven't voted yet
 * @param {Object} game - The game object
 * @returns {Promise<void>}
 */
async function pingRemainingVotes(game) {
  const alreadyVoted = Object.keys(game.settingsVotes)
  const remainingVoters = game.players.filter(
    (playerId) => !alreadyVoted.includes(playerId)
  )

  await SendMessageWithContent(
    game.gameThreadId,
    `${remainingVoters.map((voterId) => `<@${voterId}> `)}\nDon't forget to vote for your preferred settings with the selection menu above!`
  )
}
