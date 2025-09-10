import { ButtonStyleTypes, MessageComponentTypes } from 'discord-interactions'
import CONFIG from '../config.js'
import {
  RemoveMessage,
  RemovePlayerFromThread,
  UpdateMessageWithComponents,
} from '../utils/discord.js'
import {
  GetGame,
  RemoveGame,
  RemovePlayerInGame,
  SetGame,
} from '../utils/redis.js'

export class LeaveGameError extends Error {
  constructor(message, options) {
    super(message, options)
    this.name = 'LeaveGameError'
  }
}

// TODO:
// - If last player leaves game, cancel game
export default async function LeaveGame(guildId, playerId, gameId) {
  // Fetch the game from Redis
  let game = await GetGame(gameId)
  if (!game) {
    throw new LeaveGameError(`Could not find game with ID ${gameId}`)
  }

  if (game.selectedSettingId) {
    throw new LeaveGameError('Cannot leave a game after it has started')
  }

  game.players = game.players.filter((player) => player !== playerId)
  delete game.settingsVotes[playerId]

  game = await SetGame(gameId, game)

  if (!game) {
    throw new LeaveGameError('Could not leave game')
  }

  const results = await Promise.all([
    RemovePlayerInGame(playerId),
    RemovePlayerFromThread(gameId, playerId),
    updateGamePingMessage(guildId, gameId),
    cancelGameIfEmpty(guildId, gameId),
  ])

  return results
}

async function updateGamePingMessage(guildId, gameId) {
  const game = await GetGame(gameId)
  const { gameThreadId, creatorId, playerCount, eloRequirement, voiceChat } =
    game

  const components = [
    {
      type: MessageComponentTypes.TEXT_DISPLAY,
      content: `Risk Competitive Lounge game created by <@${creatorId}>!\n- Player Count: ${playerCount}\n- ELO Requirement: ${eloRequirement}\n- Voice Chat: ${voiceChat ? 'Enabled' : 'Disabled'}\n\nUse the button below to join the game!`,
    },
    {
      type: MessageComponentTypes.ACTION_ROW,
      components: [
        {
          type: MessageComponentTypes.BUTTON,
          custom_id: `join_game_${gameThreadId}`,
          label: 'Join Game',
          style: ButtonStyleTypes.PRIMARY,
        },
      ],
    },
  ]
  return await UpdateMessageWithComponents(
    CONFIG.loungeChannelId[guildId],
    game.pingMessageId,
    components
  )
}

async function cancelGameIfEmpty(guildId, gameId) {
  const game = await GetGame(gameId)
  const { players, pingMessageId, gameThreadId } = game
  if (players.length === 0) {
    await Promise.all([
      RemoveMessage(CONFIG.loungeChannelId[guildId], pingMessageId),
      RemoveGame(gameThreadId),
    ])
  }
}
