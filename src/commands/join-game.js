import { MessageComponentTypes } from 'discord-interactions'
import { AddPlayerToThread, SendMessageWithComponents } from '../utils/discord.js'
import { FetchPlayerInfo, FriendsOfRiskRequest } from '../utils/friends-of-risk.js'
import { GetGame, SetGame } from '../utils/redis.js'

export class JoinGameError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'JoinGameError';
  }
}

class GameNotFoundError extends JoinGameError {
  constructor(gameId) {
    super(`Game with ID ${gameId} not found.`);
    this.name = 'GameNotFoundError';
  }
}

class PlayerAlreadyInGameError extends JoinGameError {
  constructor(playerId, gameId) {
    super(`Player ${playerId} is already in game ${gameId}.`);
    this.name = 'PlayerAlreadyInGameError';
  }
}

class GameAlreadyFullError extends JoinGameError {
  constructor(gameId) {
    super(`Game with ID ${gameId} is already full.`);
    this.name = 'GameAlreadyFullError';
  }
}

class EloRequirementNotMetError extends JoinGameError {
  constructor(playerElo, requiredElo) {
    super(`Player does not meet the ELO requirement. Current ELO: ${playerElo}, Required ELO: ${requiredElo}.`);
    this.name = 'EloRequirementNotMetError';
  }
}

export default async function JoinGame(playerId, gameId) {
  // Fetch the game from Redis
  let game = await GetGame(gameId)
  if (!game) {
    throw new GameNotFoundError(gameId)
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
  }

  return game
}

async function validateJoinGameConditions(game, playerId) {
  // Validate if player is already in the game
  if (game.players.includes(playerId)) {
    throw new PlayerAlreadyInGameError(playerId, gameId)
  }

  // Validate if game is already full
  if (game.players.length === game.playerCount) {
    throw new GameAlreadyFullError(gameId)
  }

  // Validate player's ELO if required
  if (game.eloRequirement > 0) {
    const data = await FetchPlayerInfo(playerId)
    const playerElo = data?.ffa_elo_score || 0

    if (playerElo < game.eloRequirement) {
      throw new EloRequirementNotMetError(playerElo, game.eloRequirement)
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
