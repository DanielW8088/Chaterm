const logger = createRendererLogger('router')

let dbInitialized = false

export const beforeEach = async (_to, _from, next) => {
  if (!dbInitialized) {
    try {
      const api = window.api as any
      const dbResult = await api.initUserDatabase({ uid: 999999999 })
      logger.info('Database initialization result', { success: dbResult.success })

      if (dbResult.success) {
        dbInitialized = true
        next()
      } else {
        logger.error('Database initialization failed')
        next(false)
      }
    } catch (error) {
      logger.error('Database initialization failed', { error: error })
      next(false)
    }
    return
  }

  next()
}

export const afterEach = () => {}
