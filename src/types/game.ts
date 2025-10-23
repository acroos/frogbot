/**
 * Type definitions for game-related structures
 */

export interface GameSettings {
  settingid: string
  map: string
  gametype: string
  cards: string
  link: string
}

export interface Game {
  gameThreadId: string
  creatorId: string
  settingsOptions: GameSettings[]
  playerCount: number
  eloRequirement: number
  players: string[]
  selectedSettingId: string | undefined
  settingsVotes: Record<string, GameSettings>
  winnerVotes: Record<string, string>
  pingMessageId: string
  winner: string | undefined
  completedAt: number | undefined
  createdAt: number
  filledAt: number | undefined
}

export interface DiscordMessage {
  id: string
  channel_id: string
  content?: string
  // Add other message fields as needed
}

export interface DiscordThread {
  id: string
  name: string
  type: number
  // Add other thread fields as needed
}
