import { MessageComponentTypes } from 'discord-interactions'
import { SendMessageWithComponents } from '../utils/discord.ts'
import { GetGame, SetGame } from '../utils/redis.ts'
import { FetchPlayerInfo } from '../utils/friends-of-risk.ts'
import { VOTE_VALUES } from '../constants.ts'
import type { Game } from '../types/game.ts'
import type { FriendsOfRiskPlayerInfo } from '../types/friends-of-risk.ts'

/**
 * Marks a game as completed and sends winner selection poll
 * @param gameId - The Discord thread ID of the game to finish
 * @returns True if game was successfully finished, false if already finished
 */
export default async function FinishGame(gameId: string): Promise<boolean> {
  const gameData = await GetGame(gameId)

  if (!gameData) {
    throw new Error(`Game with ID ${gameId} not found`)
  }

  const game = gameData as Game

  // Early return if game is already completed
  if (game.completedAt) {
    return false
  }

  // Update game completion time
  game.completedAt = Date.now()

  // Fetch player info and save game state in parallel
  const [players] = await Promise.all([
    Promise.all(
      game.players.map((playerId: string) => FetchPlayerInfo(playerId))
    ) as Promise<FriendsOfRiskPlayerInfo[]>,
    SetGame(gameId, game),
  ])

  const components = [
    {
      type: MessageComponentTypes.TEXT_DISPLAY,
      content:
        'The game is complete! Please select a winner from the selection below:',
    },
    {
      type: MessageComponentTypes.ACTION_ROW,
      placeholder: 'Select a winner',
      components: [
        {
          type: MessageComponentTypes.STRING_SELECT,
          custom_id: `winner_selection_${gameId}`,
          options: [
            ...players.map((player) => ({
              label: player.name,
              value: player.discordid,
            })),
            {
              label: 'Game was not played',
              value: VOTE_VALUES.NOT_PLAYED,
            },
          ],
        },
      ],
    },
  ]

  await SendMessageWithComponents(gameId, components)

  return true
}
