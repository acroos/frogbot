import {
  InteractionResponseFlags,
  InteractionResponseType,
} from 'discord-interactions'
import { Response } from 'express'

/**
 * Sends an ephemeral success message to the user
 * @param res - Express response object
 * @param content - The message content to send
 * @returns Express response
 */
export function sendEphemeralSuccess(res: Response, content: string): unknown {
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
 * @param res - Express response object
 * @param content - The error message content to send
 * @returns Express response
 */
export function sendEphemeralError(res: Response, content: string): unknown {
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
 * @param res - Express response object
 * @returns Express response
 */
export function sendPong(res: Response): unknown {
  return res.send({ type: InteractionResponseType.PONG })
}
