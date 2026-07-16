// @ts-check

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');

const projectName = 'vr-tests-react-components';
const storySuffix = '.stories.tsx';
const moduleExtensions = ['.ts', '.tsx', '.js', '.jsx'];
const appFullSuitePaths = ['.storybook/', 'package.json', 'project.json', 'src/utilities'];
const workspaceFullSuitePaths = ['nx.json', 'package.json', 'yarn.lock', 'patches/storywright+'];

/**
 * @typedef {{
 *   mode: 'skip' | 'selective' | 'full';
 *   reason: string;
 *   affectedProjects: string[];
 *   stories: string[];
 *   partitionCount: number;
 *   partitionMatrix: number[];
 * }} VrTestPlan
 */

/**
 * @param {{
 *   appRoot: string;
 *   affectedProjects: Iterable<string>;
 *   changedFiles: Iterable<string>;
 *   forceFull?: boolean;
 * }} options
 * @returns {VrTestPlan}
 */
function createVrTestPlan(options) {
  const appRoot = path.resolve(options.appRoot);
  const workspaceRoot = path.resolve(appRoot, '../..');
  const affectedProjects = [...options.affectedProjects].sort();
  const changedFiles = [...options.changedFiles].map(file => normalizeChangedFile(file, appRoot, workspaceRoot));
  const stories = findStoryFiles(path.join(appRoot, 'src')).map(file => normalizePath(path.relative(appRoot, file)));

  if (options.forceFull) {
    return withPartitions({ mode: 'full', reason: 'full suite requested', affectedProjects, stories });
  }

  if (!affectedProjects.includes(projectName)) {
    return withPartitions({ mode: 'skip', reason: `${projectName} is not affected`, affectedProjects, stories: [] });
  }

  const appChangedFiles = changedFiles.map(file => file.appRelative).filter(Boolean);
  const fallbackPath = changedFiles.find(isFullSuitePath);

  if (fallbackPath) {
    return withPartitions({
      mode: 'full',
      reason: `shared VRT infrastructure changed: ${fallbackPath.workspaceRelative}`,
      affectedProjects,
      stories,
    });
  }

  const affectedPackages = new Set(affectedProjects.map(normalizeProjectName));
  const selectedStories = stories.filter(story => {
    if (appChangedFiles.includes(story)) {
      return true;
    }

    const dependencies = collectDependencies(path.join(appRoot, story));
    if (dependencies.localFiles.some(file => appChangedFiles.includes(normalizePath(path.relative(appRoot, file))))) {
      return true;
    }

    return dependencies.packages.some(packageName => affectedPackages.has(normalizeProjectName(packageName)));
  });

  if (selectedStories.length === 0) {
    return withPartitions({
      mode: 'full',
      reason: 'the VRT project is affected but no story dependency could explain the change',
      affectedProjects,
      stories,
    });
  }

  return withPartitions({
    mode: 'selective',
    reason: `${selectedStories.length} of ${stories.length} story files are affected`,
    affectedProjects,
    stories: selectedStories,
  });
}

/**
 * @param {Omit<VrTestPlan, 'partitionCount' | 'partitionMatrix'>} plan
 * @returns {VrTestPlan}
 */
function withPartitions(plan) {
  const partitionCount = getPartitionCount(plan.stories.length);
  return {
    ...plan,
    partitionCount,
    partitionMatrix: Array.from({ length: partitionCount }, (_, index) => index + 1),
  };
}

/** @param {number} storyFileCount */
function getPartitionCount(storyFileCount) {
  if (storyFileCount === 0) {
    return 0;
  }
  if (storyFileCount <= 40) {
    return 1;
  }
  if (storyFileCount <= 160) {
    return 2;
  }
  return 4;
}

/** @param {string} srcRoot */
function findStoryFiles(srcRoot) {
  if (!fs.existsSync(srcRoot)) {
    return [];
  }

  return fs
    .readdirSync(srcRoot, { withFileTypes: true })
    .flatMap(entry => {
      const filePath = path.join(srcRoot, entry.name);
      return entry.isDirectory() ? findStoryFiles(filePath) : entry.name.endsWith(storySuffix) ? [filePath] : [];
    })
    .sort();
}

/** @param {string} entryFile */
function collectDependencies(entryFile) {
  const pending = [entryFile];
  const localFiles = new Set();
  const packages = new Set();

  while (pending.length > 0) {
    const filePath = /** @type {string} */ (pending.pop());
    if (localFiles.has(filePath)) {
      continue;
    }

    localFiles.add(filePath);
    const source = fs.readFileSync(filePath, 'utf8');
    const imports = ts.preProcessFile(source, true, true).importedFiles.map(file => file.fileName);

    for (const importPath of imports) {
      if (importPath.startsWith('.')) {
        const resolved = resolveLocalModule(path.resolve(path.dirname(filePath), importPath));
        if (resolved) {
          pending.push(resolved);
        }
      } else if (importPath.startsWith('@fluentui/')) {
        packages.add(importPath.split('/').slice(0, 2).join('/'));
      }
    }
  }

  return { localFiles: [...localFiles], packages: [...packages] };
}

/** @param {string} modulePath */
function resolveLocalModule(modulePath) {
  const candidates = [
    modulePath,
    ...moduleExtensions.map(extension => `${modulePath}${extension}`),
    ...moduleExtensions.map(extension => path.join(modulePath, `index${extension}`)),
  ];

  return candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
}

/** @param {{ workspaceRelative: string; appRelative?: string }} file */
function isFullSuitePath(file) {
  return (
    appFullSuitePaths.some(candidate => pathMatches(file.appRelative, candidate)) ||
    workspaceFullSuitePaths.some(candidate => pathMatches(file.workspaceRelative, candidate))
  );
}

/** @param {string | undefined} file @param {string} candidate */
function pathMatches(file, candidate) {
  if (!file) {
    return false;
  }

  return file === candidate || file.startsWith(candidate.endsWith('/') ? candidate : `${candidate}/`);
}

/** @param {string} file @param {string} appRoot @param {string} workspaceRoot */
function normalizeChangedFile(file, appRoot, workspaceRoot) {
  const workspaceRelative = normalizePath(path.isAbsolute(file) ? path.relative(workspaceRoot, file) : file);
  const appPrefix = `${normalizePath(path.relative(workspaceRoot, appRoot))}/`;

  return {
    workspaceRelative,
    appRelative: workspaceRelative.startsWith(appPrefix) ? workspaceRelative.slice(appPrefix.length) : undefined,
  };
}

/** @param {string} value */
function normalizeProjectName(value) {
  return value.replace(/^@fluentui\//, '');
}

/** @param {string} value */
function normalizePath(value) {
  return value.split(path.sep).join('/');
}

/** @param {string[]} args */
function runJsonCommand(args) {
  const nx = process.platform === 'win32' ? 'nx.cmd' : 'nx';
  const result = spawnSync(nx, args, { cwd: path.resolve(__dirname, '../../..'), encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr || `'nx ${args.join(' ')}' failed`);
  }
  return JSON.parse(result.stdout);
}

function main() {
  const workspaceRoot = path.resolve(__dirname, '../../..');
  const appRoot = path.resolve(__dirname, '..');
  const base = process.env.NX_BASE || 'origin/master';
  const head = process.env.NX_HEAD || 'HEAD';
  const affectedProjects = runJsonCommand([
    'show',
    'projects',
    '--affected',
    '--base',
    base,
    '--head',
    head,
    '--json',
    '--verbose=false',
  ]);
  const gitResult = spawnSync('git', ['diff', '--name-only', `${base}...${head}`], {
    cwd: workspaceRoot,
    encoding: 'utf8',
  });
  if (gitResult.status !== 0) {
    throw new Error(gitResult.stderr || 'git diff failed');
  }

  const plan = createVrTestPlan({
    appRoot,
    affectedProjects,
    changedFiles: gitResult.stdout.trim().split('\n').filter(Boolean),
    forceFull: process.env.VRT_FORCE_FULL === 'true',
  });
  const outputPath = path.resolve(process.env.VRT_PLAN_PATH || path.join(appRoot, 'dist/vr-test-plan.json'));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`);
  console.log(JSON.stringify(plan));
}

if (require.main === module) {
  main();
}

module.exports = { collectDependencies, createVrTestPlan, getPartitionCount };
