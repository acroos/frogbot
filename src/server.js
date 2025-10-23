import CreateApp from './app.js'
import CONFIG from './config.js'

const PORT = CONFIG.port

CreateApp()
  .then((app) => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Listening on port ${PORT}`)
    })
  })
  .catch((error) => {
    console.error('Failed to create app:', error)
    process.exit(1)
  })
