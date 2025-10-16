import { MessageComponentTypes } from "discord-interactions"
import { SendMessageWithComponents } from "../utils/discord.js"
import { GetGame, SetGame } from "../utils/redis.js"
import { FetchPlayerInfo } from "../utils/friends-of-risk.js"
import { VOTE_VALUES } from "../constants.js"

/**
 * Marks a game as completed and sends winner selection poll
 * @param {string} gameId - The Discord thread ID of the game to finish
 * @returns {Promise<boolean>} True if game was successfully finished, false if already finished
 */
export default async function FinishGame(gameId) {
  let game = await GetGame(gameId)
  if (game.completedAt) {
    return false
  }

  game.completedAt = Date.now()
  game = await SetGame(gameId, game)

  const players = await Promise.all(
    game.players.map((playerId) => FetchPlayerInfo(playerId))
  )

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
              label: "Game was not played",
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
