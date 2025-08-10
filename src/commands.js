import { InstallGlobalCommands } from './utils/discord.js'

const CREATE_GAME_COMMAND = {
  name: 'create_game',
  description: 'Create a new Risk Competitive Lounge game',
  type: 1,
  integration_types: [0],
  contexts: [0],
  options: [
    {
      type: 4,
      name: 'player_count',
      description: 'Number of players in the game',
      required: true,
      choices: [
        { name: '4 Players', value: 4 },
        { name: '5 Players', value: 5 },
        { name: '6 Players', value: 6 },
      ],
    },
    {
      type: 4,
      name: 'elo_requirement',
      description:
        'The minimum ELO of players allowed in the game (default: 0).',
      required: false,
      choices: [
        { name: '1300+ ELO', value: 1300 },
        { name: '1250+ ELO', value: 1250 },
        { name: '1200+ ELO', value: 1200 },
        { name: '1150+ ELO', value: 1150 },
        { name: '1100+ ELO', value: 1100 },
        { name: '1050+ ELO', value: 1050 },
        { name: '1000+ ELO', value: 1000 },
        { name: '950+ ELO', value: 950 },
        { name: 'No Restrictions', value: 0 },
      ],
    },
    {
      type: 5,
      name: 'voice_chat',
      description: 'Include voice chat in the game',
      required: false,
    },
  ],
}

const ALL_COMMANDS = [CREATE_GAME_COMMAND]

InstallGlobalCommands(ALL_COMMANDS)
