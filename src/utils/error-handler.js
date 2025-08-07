import { InteractionResponseFlags, InteractionResponseType } from "discord-interactions";

export default function GenericErrorHandler(err, _req, res, _next) {
  // For unknown errors, log and return a generic message
  console.error('An unexpected error occurred:', err);
  return res.send({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      flags: InteractionResponseFlags.EPHEMERAL,
      content: 'An unexpected error occurred. Please try again later.',
    },
  });
}