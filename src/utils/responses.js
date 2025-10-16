import {
  InteractionResponseFlags,
  InteractionResponseType,
} from 'discord-interactions'

/**
 * Sends an ephemeral success message to the user
 * @param {Object} res - Express response object
 * @param {string} content - The message content to send
 * @returns {Object} Express response
 */
export function sendEphemeralSuccess(res, content) {
  return res.send({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      flags: InteractionResponseFlags.EPHEMERAL,
      content,
    },
  })
}

/**
 * Sends an ephemeral error message to the user
 * @param {Object} res - Express response object
 * @param {string} content - The error message content to send
 * @returns {Object} Express response
 */
export function sendEphemeralError(res, content) {
  return res.send({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      flags: InteractionResponseFlags.EPHEMERAL,
      content,
    },
  })
}

/**
 * Sends a PONG response for Discord ping verification
 * @param {Object} res - Express response object
 * @returns {Object} Express response
 */
export function sendPong(res) {
  return res.send({ type: InteractionResponseType.PONG })
}
