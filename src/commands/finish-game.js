import { MessageComponentTypes } from 'discord-interactions'
import { SendMessageWithComponents } from '../utils/discord.js'
import { GetGame, SetGame } from '../utils/redis.js'
import { FetchPlayerInfo } from '../utils/friends-of-risk.js'
import { VOTE_VALUES } from '../constants.js'

/**
 * Marks a game as completed and sends winner selection poll
 * @param {string} gameId - The Discord thread ID of the game to finish
 * @returns {Promise<boolean>} True if game was successfully finished, false if already finished
 */
export default async function FinishGame(gameId) {
  const game = await GetGame(gameId)

  // Early return if game is already completed
  if (game.completedAt) {
    return false
  }

  // Update game completion time
  game.completedAt = Date.now()

  // Fetch player info and save game state in parallel
  const [players] = await Promise.all([
    Promise.all(game.players.map((playerId) => FetchPlayerInfo(playerId))),
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
