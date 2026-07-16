// @ts-check

const path = require('path');
const fs = require('fs');

const { registerTsPaths, registerRules, rules, loadWorkspaceAddon } = require('@fluentui/scripts-storybook');
const tsConfigPath = path.resolve(__dirname, '../../../tsconfig.base.json');
const stories = getStories();

module.exports = /** @type {import('@storybook/react-webpack5').StorybookConfig} */ ({
  addons: [loadWorkspaceAddon('@fluentui/react-storybook-addon', { tsConfigPath })],
  stories,
  core: {
    disableTelemetry: true,
  },
  framework: {
    name: '@storybook/react-webpack5',
    options: {
      builder: {
        lazyCompilation: false,
      },
    },
  },
  typescript: {
    // disable react-docgen-typescript (totally not needed here, slows things down a lot)
    reactDocgen: false,
  },
  webpackFinal(config) {
    registerTsPaths({ config, configFile: tsConfigPath });
    registerRules({ config, rules: [rules.swcRule, rules.griffelRule] });

    return config;
  },
});

function getStories() {
  const planPath = process.env.VRT_PLAN_PATH;
  if (!planPath) {
    return ['../src/**/*.stories.tsx'];
  }

  /** @type {{ mode: 'skip' | 'selective' | 'full'; stories: string[] }} */
  const plan = JSON.parse(fs.readFileSync(path.resolve(planPath), 'utf8'));
  if (plan.mode === 'skip') {
    throw new Error('Cannot build the VRT Storybook when the VRT plan mode is "skip".');
  }

  if (plan.mode !== 'selective') {
    return ['../src/**/*.stories.tsx'];
  }

  if (!Array.isArray(plan.stories) || plan.stories.length === 0) {
    throw new Error('A selective VRT plan must contain at least one story file.');
  }

  return plan.stories.map(story => `../${story}`);
}
