import { spawn } from "child_process";
import path from 'path';
import fs from 'fs/promises.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger';

const runCommand = (cmd, args, projectDir) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: projectDir, shell: true, stdio: 'pipe' });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => (stdout += data.toString()));
    child.stderr.on('data', (data) => (stderr += data.toString()));

    child.on('close', (code) => {
      if (code !== 0) {
        logger.error(`Comando falhou: ${cmd} ${args.join(' ')}`, { projectDir, code, stderr });
        reject(stderr);
      } else {
        logger.info(`Comando executado com sucesso: ${cmd} ${args.join(' ')}`, { projectDir, stdout });
        resolve(stdout);
      }
    });
  });

// Instalar dependências
export const installDependencies = async (projectDir) => {
  try {
    await runCommand('corepack', ['enable'], projectDir);
    await runCommand('pnpm', ['install'], projectDir);
  } catch (error) {
    logger.warn('pnpm install falhou, tentando npm install...', { projectDir, error });
    await runCommand('npm', ['install'], projectDir);
  }
};

// Executar build
export const runBuild = async (projectDir, previewId) => {
  const viteConfigPath = path.join(projectDir, 'vite.config.js');
  const astroConfigPath = path.join(projectDir, 'astro.config.mjs'); // Para Astro

  // Tentar injetar base URL para Vite/Astro
  let originalConfigContent = null;
  let configModified = false;

  if (await fs.access(viteConfigPath).then(() => true).catch(() => false)) {
    originalConfigContent = await fs.readFile(viteConfigPath, 'utf-8');
    const newConfigContent = originalConfigContent.replace(
      /export default defineConfig\({\s*plugins: \[react\(\)\](?:,\s*base: "."(?:,\s*build: {\s*outDir: "dist"\s*})?)?/, // Regex mais robusta
      `export default defineConfig({\n  plugins: [react()],\n  base: '/preview/${previewId}/dist/',\n  build: {\n    outDir: "dist",\n  }`
    );
    await fs.writeFile(viteConfigPath, newConfigContent);
    configModified = true;
    logger.info(`vite.config.js modificado para incluir base URL: /preview/${previewId}/dist/`, { projectDir });
  } else if (await fs.access(astroConfigPath).then(() => true).catch(() => false)) {
    originalConfigContent = await fs.readFile(astroConfigPath, 'utf-8');
    const newConfigContent = originalConfigContent.replace(
      /defineConfig\({/, // Encontra defineConfig({ para injetar base
      `defineConfig({\n  base: '/preview/${previewId}/dist/',`
    );
    await fs.writeFile(astroConfigPath, newConfigContent);
    configModified = true;
    logger.info(`astro.config.mjs modificado para incluir base URL: /preview/${previewId}/dist/`, { projectDir });
  }

  try {
    await runCommand('pnpm', ['run', 'build'], projectDir);
  } catch (error) {
    logger.warn('pnpm run build falhou, tentando npm run build...', { projectDir, error });
    await runCommand('npm', ['run', 'build'], projectDir);
  } finally {
    // Restaurar o arquivo de configuração original se foi modificado
    if (configModified && originalConfigContent) {
      await fs.writeFile(viteConfigPath, originalConfigContent);
      logger.info('Arquivo de configuração restaurado para o estado original.', { projectDir });
    }
  }
};


