const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createVrTestPlan, getPartitionCount } = require('./vr-test-plan');

describe('createVrTestPlan', () => {
  let appRoot;

  beforeEach(() => {
    appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vr-test-plan-'));
    write('src/Button.stories.tsx', "import { Button } from '@fluentui/react-button';");
    write('src/Menu.stories.tsx', "import { Example } from './MenuExample';");
    write('src/MenuExample.tsx', "export { Menu as Example } from '@fluentui/react-menu';");
  });

  afterEach(() => fs.rmSync(appRoot, { recursive: true, force: true }));

  it('selects stories which import an affected package', () => {
    const plan = createVrTestPlan({
      appRoot,
      affectedProjects: ['react-button', 'vr-tests-react-components'],
      changedFiles: ['packages/react-components/react-button/library/src/Button.tsx'],
    });

    expect(plan.mode).toBe('selective');
    expect(plan.stories).toEqual(['src/Button.stories.tsx']);
  });

  it('follows local imports when matching affected packages', () => {
    const plan = createVrTestPlan({
      appRoot,
      affectedProjects: ['react-menu', 'vr-tests-react-components'],
      changedFiles: ['packages/react-components/react-menu/library/src/Menu.tsx'],
    });

    expect(plan.mode).toBe('selective');
    expect(plan.stories).toEqual(['src/Menu.stories.tsx']);
  });

  it('selects a story when its local helper changes', () => {
    const plan = createVrTestPlan({
      appRoot,
      affectedProjects: ['vr-tests-react-components'],
      changedFiles: [path.join(appRoot, 'src/MenuExample.tsx')],
    });

    expect(plan.mode).toBe('selective');
    expect(plan.stories).toEqual(['src/Menu.stories.tsx']);
  });

  it('skips when the VRT project is not affected', () => {
    const plan = createVrTestPlan({ appRoot, affectedProjects: ['react-button'], changedFiles: [] });

    expect(plan).toMatchObject({ mode: 'skip', stories: [] });
  });

  it('falls back to the full suite for shared VRT infrastructure', () => {
    const plan = createVrTestPlan({
      appRoot,
      affectedProjects: ['vr-tests-react-components'],
      changedFiles: [path.join(appRoot, '.storybook/main.js')],
    });

    expect(plan.mode).toBe('full');
    expect(plan.stories).toHaveLength(2);
  });

  it('falls back to the full suite when an affected app change cannot be mapped', () => {
    const plan = createVrTestPlan({
      appRoot,
      affectedProjects: ['vr-tests-react-components'],
      changedFiles: ['unknown-file'],
    });

    expect(plan.mode).toBe('full');
    expect(plan.reason).toContain('no story dependency');
  });

  function write(file, content) {
    const filePath = path.join(appRoot, file);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
});

describe('getPartitionCount', () => {
  it.each([
    [0, 0],
    [1, 1],
    [40, 1],
    [41, 2],
    [160, 2],
    [161, 4],
  ])('uses the expected partition count for %d story files', (storyFileCount, expected) => {
    expect(getPartitionCount(storyFileCount)).toBe(expected);
  });
});
