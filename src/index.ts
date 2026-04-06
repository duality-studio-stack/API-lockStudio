import app from './app';
import { logger } from './config/logger';

const PORT = Number(process.env.PORT ?? 3001);

const server = app.listen(PORT, () => {
  logger.info(`LockStudio API démarrée sur le port ${PORT} (${process.env.NODE_ENV ?? 'development'})`);
});

// Graceful shutdown
const shutdown = (signal: string) => {
  logger.info(`Signal ${signal} reçu — arrêt propre du serveur`);
  server.close(() => {
    logger.info('Serveur arrêté.');
    process.exit(0);
  });

  // Force exit après 10s si des connexions restent ouvertes
  setTimeout(() => {
    logger.error('Arrêt forcé après timeout');
    process.exit(1);
  }, 10_000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Erreurs non catchées — logger avant de quitter
process.on('uncaughtException', (err) => {
  logger.error('uncaughtException', { error: err });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection', { reason });
  process.exit(1);
});
