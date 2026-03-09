import express from 'express';
import { createContextLogger } from '../utils/logger.js';
import { checkDiskSpace, directoryExists } from '../utils/fileSystem.js';
// import { // checkBuildTools } from '../services/buildService.js';
import config from '../config/index.js';
import os from 'os';

const router = express.Router();
const logger = createContextLogger('HealthRoute');

// Health check básico
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🚀 Servidor de preview React/Vite funcionando corretamente.',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Health check detalhado
router.get('/health', async (req, res, next) => {
  try {
    const startTime = Date.now();
    const checks = {};

    // Verificar diretórios
    checks.directories = {
      previews: await directoryExists(config.previewsDir),
      logs: await directoryExists(config.logsDir)
    };

    // Verificar espaço em disco
    checks.diskSpace = await checkDiskSpace();

    // Verificar ferramentas de build
    try {
      await // checkBuildTools();
      checks.buildTools = { available: true };
    } catch (error) {
      checks.buildTools = { 
        available: false, 
        error: error.message 
      };
    }

    // Verificar memória
    const memUsage = process.memoryUsage();
    checks.memory = {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024)
    };

    // Verificar uptime
    checks.uptime = {
      process: Math.round(process.uptime()),
      system: Math.round(os.uptime())
    };

    // Determinar status geral
    const isHealthy = 
      checks.directories.previews &&
      checks.directories.logs &&
      checks.buildTools.available &&
      (!checks.diskSpace || checks.diskSpace.usagePercent < 95);

    const responseTime = Date.now() - startTime;

    const response = {
      success: true,
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      responseTime,
      checks,
      config: {
        nodeEnv: config.nodeEnv,
        packageManager: config.packageManager,
        maxFiles: config.maxFiles,
        maxProjectSize: Math.round(config.maxProjectSize / 1024 / 1024),
        buildTimeout: config.buildTimeoutMs / 1000
      }
    };

    if (isHealthy) {
      res.json(response);
    } else {
      res.status(503).json(response);
    }

  } catch (error) {
    logger.error('Erro durante health check:', { error: error.message });
    next(error);
  }
});

// Endpoint para estatísticas
router.get('/stats', async (req, res, next) => {
  try {
    const stats = {
      timestamp: new Date().toISOString(),
      server: {
        uptime: Math.round(process.uptime()),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage()
      }
    };

    // Contar previews ativos
    try {
      const previewsDir = config.previewsDir;
      if (await directoryExists(previewsDir)) {
        const fs = await import('fs/promises');
        const entries = await fs.readdir(previewsDir, { withFileTypes: true });
        stats.previews = {
          total: entries.filter(entry => entry.isDirectory()).length
        };
      }
    } catch (error) {
      stats.previews = { error: error.message };
    }

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    logger.error('Erro ao obter estatísticas:', { error: error.message });
    next(error);
  }
});

export default router;

