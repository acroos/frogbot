import CreateApp from './app.ts'
import CONFIG from './config.js'

const PORT = Number(CONFIG.port)

CreateApp()
  .then((app) => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Listening on port ${PORT}`)
    })
  })
  .catch((error: unknown) => {
    console.error('Failed to create app:', error)
    process.exit(1)
  })
