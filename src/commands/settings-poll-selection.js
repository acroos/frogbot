import { ButtonStyleTypes, MessageComponentTypes } from 'discord-interactions'
import { GetGame, SetGame } from '../utils/redis.js'
import {
  SendMessageWithComponents,
  SendMessageWithContent,
} from '../utils/discord.js'

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
  // Fetch game once at the start
  const game = await GetGame(gameId)
  
  // Validate that the game is not already finalized
  const votes = Object.values(game.settingsVotes)
  if (votes.length === game.playerCount) {
    return false
  }

  // Add the vote to the game
  const settingsChoice = game.settingsOptions.find(
    (option) => option.settingid === selectionId
  )
  game.settingsVotes[playerId] = settingsChoice
  await SetGame(gameId, game)

  // Check if we should finalize
  const updatedVotes = Object.values(game.settingsVotes)
  if (updatedVotes.length === game.playerCount) {
    // Finalize settings - randomly select from votes
    const selectedSettings = updatedVotes[Math.floor(Math.random() * updatedVotes.length)]
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

/**
 * Sends the game start message with finalized settings
 * @param {Object} game - The game object
 * @param {Object} selectedSettings - The selected settings
 * @returns {Promise<Object>} The sent message response
 */
async function sendStartGameMessage(game, selectedSettings) {

  const components = [
    {
      type: MessageComponentTypes.TEXT_DISPLAY,
      content: `${game.players.map((playerId) => `<@${playerId}>`)}\nSettings have been finalized for the game!`,
    },
    {
      type: MessageComponentTypes.MEDIA_GALLERY,
      items: [
        {
          media: {
            url: selectedSettings.link,
          },
          description: `${selectedSettings.map} ${selectedSettings.cards} ${selectedSettings.gametype} [#${selectedSettings.settingid}]`,
        },
      ],
    },
    {
      type: MessageComponentTypes.TEXT_DISPLAY,
      content: 'When the game is complete, please click the button below',
    },
    {
      type: MessageComponentTypes.ACTION_ROW,
      components: [
        {
          type: MessageComponentTypes.BUTTON,
          custom_id: `finish_game_${gameId}`,
          label: 'Finish Game',
          style: ButtonStyleTypes.PRIMARY,
        },
      ],
    },
  ]

  return await SendMessageWithComponents(game.gameThreadId, components)
}
