import { MessageComponentTypes } from 'discord-interactions'
import { AddPlayerToThread, SendMessageWithComponents, SendMessageWithContent } from '../utils/discord.js'
import { FetchPlayerInfo, FriendsOfRiskRequest } from '../utils/friends-of-risk.js'
import { GetGame, SetGame } from '../utils/redis.js'

export class JoinGameError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'JoinGameError';
  }
}

// TODO:
// - Add player to "currently playing"
// - Add a tiner for selecting settings
export default async function JoinGame(playerId, gameId) {
  // Fetch the game from Redis
  let game = await GetGame(gameId)
  if (!game) {
    throw new JoinGameError(`Game with ID ${gameId} not found.`)
  }

  // Validate player is allowed to join game
  game = await validateJoinGameConditions(game, playerId)

  // Add the player to the game thread
  await AddPlayerToThread(gameId, playerId)

  game.players.push(playerId) // Add player to the game
  game = await SetGame(gameId, game) // Update the game in Redis

  if (game.playerCount === game.players.length) {
    // Send the initial message in the game thread with settings options
    await sendLobbyFullMessage(gameId)
  } else {
    await sendWelcomeMessage(gameId, playerId)
  }

  return game
}

async function validateJoinGameConditions(game, playerId) {
  const gameId = game.gameThreadId
  // Validate if player is already in the game
  if (game.players.includes(playerId)) {
    throw new JoinGameError(`Player ${playerId} is already in game ${gameId}.`)
  }

  // Validate if game is already full
  if (game.players.length === game.playerCount) {
    throw new JoinGameError(`Game with ID ${gameId} is already full.`)
  }

  // Validate player's ELO if required
  if (game.eloRequirement > 0) {
    const data = await FetchPlayerInfo(playerId)
    const playerElo = data?.ffa_elo_score || 0

    if (playerElo < game.eloRequirement) {
      throw new JoinGameError(`Player does not meet the ELO requirement. Current ELO: ${playerElo}, Required ELO: ${game.eloRequirement}.`)
    }
  }

  return game
}

async function sendLobbyFullMessage(gameId) {
  const game = await GetGame(gameId)
  const components = [
    {
      type: MessageComponentTypes.TEXT_DISPLAY,
      content:
        'The game is full! Please select your preferred settings in the poll below.\n\nOnce all players have voted on their preferred settings, one will randomly be chosen and you may start the game.',
    },
    {
      type: MessageComponentTypes.MEDIA_GALLERY,
      items: game.settingsOptions.map((settingsOption) => ({
        media: {
          url: settingsOption.link,
        },
        description: `${settingsOption.map} ${settingsOption.cards} ${settingsOption.gametype} [#${settingsOption.settingid}]`,
      })),
    },
    {
      type: MessageComponentTypes.ACTION_ROW,
      components: [
        {
          type: MessageComponentTypes.STRING_SELECT,
          custom_id: `settings_poll_${gameId}`,
          placeholder: 'Vote for your preferred settings',
          options: game.settingsOptions.map((settingsOption) => ({
            label: `${settingsOption.map} ${settingsOption.cards} ${settingsOption.gametype} [#${settingsOption.settingid}]`,
            value: settingsOption.settingid,
          })),
        },
      ],
    },
  ]
  await SendMessageWithComponents(gameId, components)
}

async function sendWelcomeMessage(gameId, playerId) {
  const game = await GetGame(gameId)

  const currentPlayerCount = game.players.length

  const message = `Welcome to the game <@${playerId}>!\n\nHang tight for a few minutes while we wait for a full lobby.  We currently have ${currentPlayerCount} players here, we need ${game.playerCount} to start.`

  await SendMessageWithContent(gameId, message)
}
