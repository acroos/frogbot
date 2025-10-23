import { ButtonStyleTypes, MessageComponentTypes } from 'discord-interactions'
import CONFIG from '../config.js'
import {
  RemoveMessage,
  RemovePlayerFromThread,
  UpdateMessageWithComponents,
} from '../utils/discord.ts'
import {
  GetGame,
  RemoveGame,
  RemovePlayerInGame,
  SetGame,
} from '../utils/redis.ts'
import type { Game } from '../types/game.ts'

export class LeaveGameError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'LeaveGameError'
  }
}

/**
 * Removes a player from a game they previously joined
 * @param guildId - The Discord guild ID
 * @param playerId - The Discord user ID of the player leaving
 * @param gameId - The Discord thread ID of the game to leave
 * @throws {LeaveGameError} If player cannot leave (not in game, game not found, etc.)
 */
// TODO:
// - If last player leaves game, cancel game
export default async function LeaveGame(
  guildId: string,
  playerId: string,
  gameId: string
): Promise<void> {
  // Fetch the game from Redis
  const gameData = await GetGame(gameId)
  if (!gameData) {
    throw new LeaveGameError(`Could not find game with ID ${gameId}`)
  }
  const game = gameData as Game

  if (game.selectedSettingId) {
    throw new LeaveGameError('Cannot leave a game after it has started')
  }

  // Remove player from game and their settings vote
  game.players = game.players.filter((player) => player !== playerId)
  delete game.settingsVotes[playerId]

  // Save updated game state
  const savedGame = await SetGame(gameId, game)
  if (!savedGame) {
    throw new LeaveGameError('Could not leave game')
  }

  // Execute all cleanup operations in parallel
  await Promise.all([
    RemovePlayerInGame(playerId),
    RemovePlayerFromThread(gameId, playerId),
    updateGamePingMessage(guildId, game),
    cancelGameIfEmpty(guildId, game),
  ])
}

/**
 * Updates the ping message in the lounge channel after player leaves
 * @param guildId - The Discord guild ID
 * @param game - The game object
 * @returns The updated message response
 */
async function updateGamePingMessage(
  guildId: string,
  game: Game
): Promise<unknown> {
  const { gameThreadId, creatorId, playerCount, eloRequirement } = game

  const components = [
    {
      type: MessageComponentTypes.TEXT_DISPLAY,
      content: `Risk Competitive Lounge game created by <@${creatorId}>!\n- Player Count: ${playerCount}\n- ELO Requirement: ${eloRequirement}\n\nUse the button below to join the game!`,
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
    CONFIG.loungeChannelId[guildId as keyof typeof CONFIG.loungeChannelId],
    game.pingMessageId,
    components
  )
}

/**
 * Cancels the game if no players remain
 * @param guildId - The Discord guild ID
 * @param game - The game object
 */
async function cancelGameIfEmpty(guildId: string, game: Game): Promise<void> {
  const { players, pingMessageId, gameThreadId } = game
  if (players.length === 0) {
    await Promise.all([
      RemoveMessage(
        CONFIG.loungeChannelId[guildId as keyof typeof CONFIG.loungeChannelId],
        pingMessageId
      ),
      RemoveGame(gameThreadId),
    ])
  }
}
