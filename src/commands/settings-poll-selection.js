import {
  MessageComponentTypes,
} from 'discord-interactions'
import { GetGame, SetGame } from '../utils/redis.js'
import {
  SendMessageWithComponents,
  SendMessageWithContent,
} from '../utils/discord.js'
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
    const game = await maybeFinalizeVote(gameId)
    if (game) {
      const finalizedSettings = game.settingsOptions.find(
        (option) => option.settingid === game.selectedSettingId
      )
      console.log(`Finalized settings: ${JSON.stringify(finalizedSettings)}`)
      await sendStartGameMessage(gameId, finalizedSettings)
    } else {
      await pingRemainingVotes(gameId)
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
  let game = await GetGame(gameId)
  const votes = Object.values(game.settingsVotes)
  if (votes.length === game.playerCount) {
    const selectedSettings = votes[Math.floor(Math.random() * votes.length)]
    game.selectedSettingId = selectedSettings.settingid
    return SetGame(gameId, game)
  }
  return null
}

async function pingRemainingVotes(gameId) {
  const game = await GetGame(gameId)
  const alreadyVoted = Object.keys(game.settingsVotes)
  const remainingVoters = game.players.filter((playerId) => !alreadyVoted.includes(playerId))

  await SendMessageWithContent(
    gameId,
    `${remainingVoters.map((voterId) => `<@${voterId}> `)}\nDon't forget to vote for your prferred settings with the selection menu above!`
  )
}

async function sendStartGameMessage(gameId, selectedSettings) {
  const game = await GetGame(gameId)
  console.log(`Game right before starting: ${JSON.stringify(game)}`)
  const players = await Promise.all(
    game.players.map((playerId) => FetchPlayerInfo(playerId))
  )

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
          options: players.map((player) => ({
            label: player.name,
            value: player.discordid,
          })),
        },
      ],
    },
  ]

  return await SendMessageWithComponents(gameId, components)
}
