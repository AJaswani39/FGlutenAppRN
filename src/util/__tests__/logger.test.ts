describe('logger', () => {
  const globalWithDev = globalThis as typeof globalThis & { __DEV__?: boolean };

  afterEach(() => {
    globalWithDev.__DEV__ = true;
    jest.restoreAllMocks();
  });

  it('logs errors and warnings in development', () => {
    globalWithDev.__DEV__ = true;
    jest.isolateModules(() => {
      const { logger } = require('../logger') as typeof import('../logger');
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      logger.error('boom', new Error('boom'));
      logger.warn('careful');

      expect(errorSpy).toHaveBeenCalledWith('boom', expect.any(Error));
      expect(warnSpy).toHaveBeenCalledWith('careful');
    });
  });

  it('stays silent outside development', () => {
    globalWithDev.__DEV__ = false;
    jest.isolateModules(() => {
      const { logger } = require('../logger') as typeof import('../logger');
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      logger.error('boom');
      logger.warn('careful');

      expect(errorSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  it('re-exports reportError from errorReporting', () => {
    jest.isolateModules(() => {
      const { reportError } = require('../logger') as typeof import('../logger');
      expect(typeof reportError).toBe('function');
    });
  });
});
