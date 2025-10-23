/**
 * Type definitions for Friends of Risk API
 */

export interface FriendsOfRiskPlayerInfo {
  discordid: string
  name: string
  username?: string
  ffa_elo_score?: number
  profile: FriendsOfRiskProfile | null
}

export interface FriendsOfRiskProfile {
  elo: number
  ffa_elo_score?: number
  // Add other profile fields as needed
}

export interface FriendsOfRiskApiResponse<T> {
  data: T
  success: boolean
  message?: string
}

export interface FriendsOfRiskRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: Record<string, unknown>
}
