import {
  InteractionResponseFlags,
  MessageComponentTypes,
} from 'discord-interactions'
import { GetGame, SetGame } from '../utils/redis.js'
import { SendMessageWithComponents } from '../utils/discord.js'
import { FetchPlayerInfo } from '../utils/friends-of-risk.js'

class SettingsAlreadyFinalizedError extends Error {
  constructor(message) {
    super(message)
    this.name = 'SettingsAlreadyFinalizedError'
  }
}

export default async function SettingsPollSelectionMade(
  gameId,
  playerId,
  selectionId
) {
  // Validate that the game is not already finalized
  try {
    await validateGameNotAlreadyFinalized(gameId)
  } catch (error) {
    if (error instanceof SettingsAlreadyFinalizedError) {
      return false
    }
    throw error
  }

  await addSettingsVoteToGame(gameId, playerId, selectionId).then(async () => {
    const finalizedSettings = await maybeFinalizeVote(gameId)
    console.log(`Finalized settings: ${JSON.stringify(finalizedSettings)}`)

    if (finalizedSettings) {
      await sendStartGameMessage(gameId, finalizedSettings)
    }
  })

  return true
}

async function validateGameNotAlreadyFinalized(gameId) {
  const game = await GetGame(gameId)
  const votes = Object.values(game.settingsVotes)
  if (votes.length === game.playerCount) {
    throw new SettingsAlreadyFinalizedError()
  }
}

async function addSettingsVoteToGame(gameId, playerId, selectedSettingId) {
  const game = await GetGame(gameId)
  const settingsChoice = game.settingsOptions.find(
    (option) => option.settingid === selectedSettingId
  )
  game.settingsVotes[playerId] = settingsChoice
  return await SetGame(gameId, game) // Update the game in Redis
}

async function maybeFinalizeVote(gameId) {
  const game = await GetGame(gameId)
  console.log(`Game: ${JSON.stringify(game)}`)
  const votes = Object.values(game.settingsVotes)
  if (votes.length === game.playerCount) {
    console.log(`Voting completed; Votes: ${JSON.stringify(votes)}`)
    const selectedSettings = votes[Math.floor(Math.random() * votes.length)]
    return selectedSettings
  }
  return null
}

async function sendStartGameMessage(gameId, selectedSettings) {
  const game = await GetGame(gameId)
  const players = await Promise.all(game.players.map((playerId) => FetchPlayerInfo(playerId)));

  const components = [
    {
      type: MessageComponentTypes.TEXT_DISPLAY,
      content: `Settings have been finalized for the game!`,
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
      content:
        'When the game is complete, please select a winner from the selection below',
    },
    {
      type: MessageComponentTypes.ACTION_ROW,
      placeholder: 'Select a winner',
      components: [
        {
          type: MessageComponentTypes.STRING_SELECT,
          custom_id: `winner_selection_${gameId}`,
          options: players.map(player => ({
            label: player.name,
            value: player.discordid
          }))
        },
      ],
    },
  ]

  return await SendMessageWithComponents(gameId, components)
}
